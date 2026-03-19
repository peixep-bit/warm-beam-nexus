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
import { calcularTotalLiquidoPDV, aplicarRegras, type FeeRule, type BaseValues } from "@/lib/calculo-conciliacao";
import { Calculator, Search, Receipt, CheckCircle2, XCircle, ArrowRightLeft, BookOpen } from "lucide-react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const isCancelado = (item: any) => {
  const desc = String(item.descricao ?? "").toUpperCase();
  return desc.includes("CANCELADO") || desc.includes("PARCIAL");
};

export function ReconciliationDashboard() {
  const [selectedMarcaKey, setSelectedMarcaKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [searchPedido, setSearchPedido] = useState("");

  // Derive marca name and platformId from composite key "marca::platformId"
  const selectedMarca = selectedMarcaKey ? selectedMarcaKey.split("::")[0] : "";
  const selectedPlatformId = selectedMarcaKey ? selectedMarcaKey.split("::")[1] || "" : "";


  // Fetch distinct marcas from DB with platform info — each marca+platform = separate option
  const { data: marcaOptions = [] } = useQuery({
    queryKey: ["reconciliation-marcas"],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("statement_items")
        .select("marca, loja, cnpj, import_id");
      if (error) throw error;

      const importIds = [...new Set((items || []).map((i: any) => i.import_id))];
      const { data: imports } = importIds.length > 0
        ? await supabase.from("statement_imports").select("id, platform_id").in("id", importIds)
        : { data: [] };
      const importMap = new Map((imports || []).map((imp: any) => [imp.id, imp.platform_id]));

      const { data: platforms } = await supabase.from("platforms").select("id, name");
      const platformNameMap = new Map((platforms || []).map((p: any) => [p.id, p.name]));

      // Key = marca + platformId so each combination is a separate option
      const set = new Map<string, { marca: string; label: string; platformId: string }>();
      (items || []).forEach((i: any) => {
        const marca = i.marca || i.cnpj || "";
        if (!marca) return;
        const platformId = importMap.get(i.import_id) || "";
        const platformName = platformNameMap.get(platformId) || "";
        const compositeKey = `${marca}::${platformId}`;

        if (!set.has(compositeKey)) {
          const label = marca + (platformName ? ` — ${platformName}` : "") + (i.loja ? ` — ${i.loja}` : "");
          set.set(compositeKey, { marca, label, platformId });
        }
      });
      return Array.from(set.entries()).map(([compositeKey, info]) => ({
        value: compositeKey,
        marca: info.marca,
        label: info.label,
        platformId: info.platformId,
      }));
    },
  });

  // Fetch platform_ids from statement_items via their imports
  const { data: importPlatforms = [] } = useQuery({
    queryKey: ["import-platforms", selectedMarca],
    queryFn: async () => {
      if (!selectedMarca) return [];
      // Get import_ids from statement_items for this marca
      const { data: items, error: itemsErr } = await supabase
        .from("statement_items")
        .select("import_id")
        .or(`marca.eq.${selectedMarca},cnpj.eq.${selectedMarca},loja.eq.${selectedMarca}`);
      if (itemsErr) throw itemsErr;
      const importIds = [...new Set((items || []).map((i: any) => i.import_id))];
      if (importIds.length === 0) return [];
      // Get platform_ids from those imports
      const { data: imports, error: impErr } = await supabase
        .from("statement_imports")
        .select("platform_id")
        .in("id", importIds);
      if (impErr) throw impErr;
      return [...new Set((imports || []).map((d: any) => d.platform_id))];
    },
    enabled: !!selectedMarca,
  });

  // Fetch fee rules filtered by marca AND platform
  const { data: feeRules = [] } = useQuery({
    queryKey: ["fee_rules_for_marca", selectedMarca, importPlatforms],
    queryFn: async () => {
      if (!selectedMarca || importPlatforms.length === 0) return [];
      const { data, error } = await supabase
        .from("fee_rules")
        .select("*, platforms(name)")
        .or(`marca.eq.${selectedMarca},marca.is.null`)
        .in("platform_id", importPlatforms)
        .order("created_at");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!selectedMarca && importPlatforms.length > 0,
  });

  // Convert to FeeRule interface
  const activeRules: FeeRule[] = useMemo(() => {
    // Prefer marca-specific rules; if none exist, use generic (marca=null)
    const specific = feeRules.filter((r: any) => r.marca === selectedMarca);
    const generic = feeRules.filter((r: any) => !r.marca);
    const rules = specific.length > 0 ? specific : generic;
    return rules.map((r: any) => ({
      name: r.name,
      percentage: r.percentage,
      fixed_amount: r.fixed_amount,
      base_field: r.base_field || "LiqPDV",
    }));
  }, [feeRules, selectedMarca]);

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
  const { data: rawDayItems = [] } = useQuery({
    queryKey: ["reconciliation-day", selectedMarca, selectedDate],
    queryFn: async () => {
      if (!selectedMarca || !selectedDate) return [];
      const { data, error } = await supabase
        .from("statement_items")
        .select("*, statement_imports!inner(platform_id)")
        .or(`marca.eq.${selectedMarca},cnpj.eq.${selectedMarca}`)
        .eq("data_transacao", selectedDate)
        .order("numero_pedido");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedMarca && !!selectedDate,
  });

  // Filter by platform from the selected marca key
  const dayItems = useMemo(() => {
    if (!selectedPlatformId) return rawDayItems;
    return rawDayItems.filter((i: any) => i.statement_imports?.platform_id === selectedPlatformId);
  }, [rawDayItems, selectedPlatformId]);

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

    const extratoMapLocal = new Map<string, any>();
    extratoItems.forEach((i: any) => {
      if (i.numero_pedido) extratoMapLocal.set(String(i.numero_pedido), i);
    });

    const allPedidos = new Set([...pdvMap.keys(), ...extratoMapLocal.keys()]);
    const results: any[] = [];

    allPedidos.forEach((pedido) => {
      const pdv = pdvMap.get(pedido);
      const ext = extratoMapLocal.get(pedido);

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

      const diff = pdvLiq != null && extLiq != null ? pdvLiq - extLiq : null;
      let status: "ok" | "divergente" | "so_pdv" | "so_extrato" | "cancelado" = "ok";
      if (!pdv) status = "so_extrato";
      else if (!ext) status = "so_pdv";
      else if (ext.descricao?.toUpperCase().includes("CANCELADO")) status = "cancelado";
      else if (Math.abs(diff ?? 0) > 0.05) status = "divergente";

      results.push({ pedido, pdv, ext, pdvLiq, extValorItens, extLiq, extTaxas, diff, status });
    });

    return results.sort((a, b) => {
      const order = { divergente: 0, so_pdv: 1, so_extrato: 2, cancelado: 3, ok: 4 };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    });
  }, [pdvItems, extratoItems, hasBothSources]);

  const displayItems = useMemo(() => {
    const items = pdvItems.length > 0 ? pdvItems : dayItems;
    if (!searchPedido) return items;
    return items.filter((i: any) =>
      i.numero_pedido?.toLowerCase().includes(searchPedido.toLowerCase()),
    );
  }, [dayItems, pdvItems, searchPedido]);

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
    const sourceItems = pdvItems.length > 0 ? pdvItems : dayItems;
    const activeItems = sourceItems.filter((i: any) => !isCancelado(i));
    const cancelados = sourceItems.filter((i: any) => isCancelado(i));
    const sum = (key: string, items: any[] = activeItems) => items.reduce((s: number, i: any) => s + Number(i[key] ?? 0), 0);
    const valorItens = sum("valor_pdv");
    const incentivoLoja = sum("incentivo_loja");
    const taxasComissoes = sum("taxas_comissoes");
    const taxaEntrega = sum("valor_taxa_entrega");
    const desconto = sum("desconto");
    const totalLiquido = calcularTotalLiquidoPDV(valorItens, incentivoLoja, taxasComissoes, taxaEntrega, desconto);
    const valorBruto = sum("valor_bruto");
    const baseValues: BaseValues = { LiqPDV: totalLiquido, ValorItens: valorItens, ValorBruto: valorBruto };
    const { deductions, conciliado } = aplicarRegras(baseValues, activeRules);

    // Cancelled totals
    const canceladoLiq = cancelados.reduce((s: number, i: any) => s + calcularTotalLiquidoPDV(
      Number(i.valor_pdv ?? 0), Number(i.incentivo_loja ?? 0), Number(i.taxas_comissoes ?? 0),
      Number(i.valor_taxa_entrega ?? 0), Number(i.desconto ?? 0)
    ), 0);

    return {
      valorItens, incentivoLoja, taxasComissoes,
      incentivoIfood: sum("incentivo_ifood"),
      taxaServico: sum("taxa_servico"),
      taxaEntrega, desconto,
      liquidoPlataforma: sum("valor_liquido"),
      totalLiquido, pedidos: activeItems.length,
      cancelados: cancelados.length, canceladoLiq,
      totalPedidos: sourceItems.length,
      extratoLiquido: sum("valor_liquido", extratoItems),
      extratoTaxas: sum("taxas_comissoes", extratoItems),
      extratoPedidos: extratoItems.length,
      deductions, conciliado,
    };
  }, [dayItems, pdvItems, extratoItems, activeRules]);

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

  const hasRules = activeRules.length > 0;

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Marca</Label>
              <Select value={selectedMarcaKey} onValueChange={(v) => { setSelectedMarcaKey(v); setSelectedDate(""); }}>
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
        <Tabs defaultValue="conciliacao" className="space-y-4">
          <TabsList className="h-9">
            <TabsTrigger value="conciliacao" className="text-xs">Conciliação</TabsTrigger>
            <TabsTrigger value="regras" className="text-xs">
              <BookOpen className="h-3.5 w-3.5 mr-1" />
              Regras {hasRules ? `(${activeRules.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conciliacao" className="space-y-4">
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
              <div className="flex items-center justify-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                <Badge variant="secondary">{totals.pedidos} pedido(s) ativos</Badge>
                {totals.cancelados > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    <XCircle className="h-3 w-3 mr-0.5" />
                    {totals.cancelados} cancelado(s) — {fmt(totals.canceladoLiq)} excluído(s)
                  </Badge>
                )}
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

              {/* Dynamic rules deductions */}
              {hasRules && (
                <div className="border-t mt-3 pt-3">
                  <p className="text-xs text-muted-foreground mb-2 font-semibold">📐 Conciliação por Regras</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
                    {totals.deductions.map((d, idx) => (
                      <div key={idx}>
                        <p className="text-xs text-muted-foreground mb-1">{d.name}</p>
                        <p className="font-bold text-destructive">{fmt(d.value)}</p>
                      </div>
                    ))}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-semibold">Conc. Manutenção</p>
                      <p className="font-bold text-lg text-green-700">{fmt(totals.conciliado)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Extrato-based conciliation */}
              {hasBothSources && (
                <div className="border-t mt-3 pt-3">
                  <p className="text-xs text-muted-foreground mb-2 font-semibold">📋 Conciliação pelo Extrato</p>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Líq. PDV</p>
                      <p className="font-bold text-lg text-primary">{fmt(totals.totalLiquido)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Taxas Extrato</p>
                      <p className="font-bold text-lg text-destructive">{fmt(totals.extratoTaxas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-semibold">Líq. Extrato</p>
                      <p className="font-bold text-lg text-green-700">{fmt(totals.totalLiquido + totals.extratoTaxas)}</p>
                    </div>
                  </div>
                </div>
              )}

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
                        {activeRules.map((rule, idx) => (
                          <TableHead key={idx} className="text-xs text-right text-destructive">{rule.name}</TableHead>
                        ))}
                        {hasRules && <TableHead className="text-xs text-right font-bold bg-amber-500/10">Conc. Regras</TableHead>}
                        {hasBothSources && <TableHead className="text-xs text-right text-destructive font-bold bg-destructive/5">Taxas Extrato</TableHead>}
                        {hasBothSources && <TableHead className="text-xs text-right font-bold bg-green-500/10">Líq. Extrato</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayItems.map((item: any) => {
                        const cancelled = isCancelado(item);
                        const valorItensItem = Number(item.valor_pdv ?? 0);
                        const liq = calcularTotalLiquidoPDV(
                          valorItensItem,
                          Number(item.incentivo_loja ?? 0),
                          Number(item.taxas_comissoes ?? 0),
                          Number(item.valor_taxa_entrega ?? 0),
                          Number(item.desconto ?? 0),
                        );
                        const itemBaseValues: BaseValues = { LiqPDV: liq, ValorItens: valorItensItem, ValorBruto: Number(item.valor_bruto ?? 0) };
                        const { deductions, conciliado } = aplicarRegras(itemBaseValues, activeRules);
                        // Cross-reference with extrato
                        const ext = extratoMap.get(String(item.numero_pedido));
                        const extTaxas = ext ? Number(ext.taxas_comissoes ?? 0) : null;
                        const extConciliado = extTaxas != null ? liq + extTaxas : null;
                        const rowClass = cancelled ? "opacity-50 line-through bg-destructive/5" : "";
                        return (
                          <TableRow key={item.id} className={rowClass}>
                            <TableCell className="text-xs font-mono">
                              <span className="flex items-center gap-1">
                                {item.numero_pedido || "—"}
                                {cancelled && <Badge variant="destructive" className="text-[8px] px-1 py-0 no-underline">Cancelado</Badge>}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right">{fmt(Number(item.valor_pdv ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right text-destructive">{fmt(Number(item.incentivo_loja ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right text-destructive">{fmt(Number(item.taxas_comissoes ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right">{fmt(Number(item.valor_taxa_entrega ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right text-destructive">-{fmt(Number(item.desconto ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right font-bold text-primary bg-primary/5">{fmt(liq)}</TableCell>
                            {deductions.map((d, idx) => (
                              <TableCell key={idx} className="text-xs text-right text-destructive font-medium">{fmt(d.value)}</TableCell>
                            ))}
                            {hasRules && <TableCell className="text-xs text-right font-bold bg-amber-500/10 text-amber-700">{fmt(conciliado)}</TableCell>}
                            {hasBothSources && (
                              <TableCell className="text-xs text-right text-destructive font-medium bg-destructive/5">
                                {extTaxas != null ? fmt(extTaxas) : "—"}
                              </TableCell>
                            )}
                            {hasBothSources && (
                              <TableCell className="text-xs text-right font-bold bg-green-500/10 text-green-700">
                                {extConciliado != null ? fmt(extConciliado) : "—"}
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
          </TabsContent>

          <TabsContent value="regras">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  {selectedMarca}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {hasRules
                    ? `${activeRules.length} regra(s) de conciliação configurada(s) para esta marca`
                    : "Nenhuma regra configurada. Cadastre regras na aba \"Taxas\" do menu."}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasRules ? (
                  <>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">#</TableHead>
                            <TableHead className="text-xs">Regra</TableHead>
                            <TableHead className="text-xs">Base</TableHead>
                            <TableHead className="text-xs text-right">Percentual</TableHead>
                            <TableHead className="text-xs text-right">Valor Fixo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeRules.map((rule, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs font-mono">{idx + 1}</TableCell>
                              <TableCell className="text-xs font-medium">{rule.name}</TableCell>
                              <TableCell className="text-xs font-mono">{rule.base_field}</TableCell>
                              <TableCell className="text-xs text-right">
                                {rule.percentage != null ? `${rule.percentage}%` : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {rule.fixed_amount != null ? fmt(rule.fixed_amount) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-green-500/5">
                            <TableCell className="text-xs font-mono">{activeRules.length + 1}</TableCell>
                            <TableCell className="text-xs font-bold">Conciliado</TableCell>
                            <TableCell className="text-xs font-mono">LiqPDV</TableCell>
                            <TableCell className="text-xs text-right font-bold" colSpan={2}>
                              Líq. PDV {activeRules.map(r => {
                                if (r.percentage != null) return ` ${r.percentage > 0 ? '+' : ''}${r.percentage}%`;
                                if (r.fixed_amount != null) return ` ${r.fixed_amount > 0 ? '+' : ''}${fmt(r.fixed_amount)}`;
                                return '';
                              }).join('')}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-xs font-medium mb-2">📋 Resumo da fórmula</p>
                      <code className="text-xs block bg-background rounded p-3 border">
                        Conciliado = Líq. PDV{activeRules.map(r => {
                          if (r.percentage != null) return ` ${r.percentage > 0 ? '+' : '−'} (Líq. PDV × ${Math.abs(r.percentage)}%)`;
                          if (r.fixed_amount != null) return ` ${r.fixed_amount > 0 ? '+' : '−'} ${fmt(Math.abs(r.fixed_amount))}`;
                          return '';
                        }).join('')}
                      </code>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Nenhuma regra cadastrada para esta marca. Vá em "Taxas" no menu lateral para criar regras.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
