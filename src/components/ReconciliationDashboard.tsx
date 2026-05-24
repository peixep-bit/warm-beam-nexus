/**
 * ReconciliationDashboard.tsx — v2
 * Lê os dados salvos do import e exibe exatamente o mesmo layout do preview.
 * Fonte da verdade = o que foi importado. Sem recalcular regras próprias.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtBRL } from "@/lib/ifood-parser";
import {
  CheckCircle2, AlertTriangle, XCircle, Info,
  ChevronDown, ChevronUp, ArrowRight, Equal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// ─── Status config (igual ao IFoodImport) ─────────────────────

const STATUS_CFG = {
  nenhuma:                { label: "Conciliado",           cls: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500",  Icon: CheckCircle2  },
  conciliado:             { label: "Conciliado",           cls: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500",  Icon: CheckCircle2  },
  divergente_valor:       { label: "Divergência de valor", cls: "bg-amber-100 text-amber-800",     bar: "bg-amber-500",    Icon: AlertTriangle },
  divergente_status:      { label: "Status conflitante",   cls: "bg-red-100 text-red-800",         bar: "bg-red-500",      Icon: XCircle       },
  nao_encontrado_pdv:     { label: "Sem PDV",              cls: "bg-orange-100 text-orange-800",   bar: "bg-orange-500",   Icon: AlertTriangle },
  nao_encontrado_extrato: { label: "Sem extrato",          cls: "bg-orange-100 text-orange-800",   bar: "bg-orange-400",   Icon: AlertTriangle },
  cancelado:              { label: "Cancelado",            cls: "bg-slate-100 text-slate-600",     bar: "bg-slate-400",    Icon: XCircle       },
  sob_demanda:            { label: "Sob Demanda",          cls: "bg-blue-100 text-blue-800",       bar: "bg-blue-500",     Icon: Info          },
} as const;

// ─── Campo financeiro ─────────────────────────────────────────

function Campo({ label, valor, cor = "", destaque = false, hideZero = false }: {
  label: string; valor: number; cor?: string; destaque?: boolean; hideZero?: boolean;
}) {
  if (hideZero && Math.abs(valor) < 0.01) return null;
  return (
    <div className={`rounded-lg px-3 py-2 border ${destaque ? "border-primary/30 bg-primary/5" : "border-border/50 bg-background"}`}>
      <p className="text-[10px] text-muted-foreground mb-0.5 leading-tight">{label}</p>
      <p className={`text-sm font-semibold font-mono ${destaque ? "text-base" : ""} ${cor || "text-foreground"}`}>
        {Math.abs(valor) < 0.01
          ? <span className="text-muted-foreground/40">R$ 0,00</span>
          : fmtBRL(valor)}
      </p>
    </div>
  );
}

// ─── Detalhe expandido por pedido ────────────────────────────

function DetalhesPedido({ item }: { item: any }) {
  const bruto        = Number(item.valor_pdv ?? 0);
  const descLoja     = Number(item.incentivo_loja ?? 0);
  const fatPDV       = bruto - descLoja;
  const taxas        = Number(item.taxas_comissoes ?? 0);
  const incIfood     = Number(item.incentivo_ifood ?? 0);
  const incRede      = Number(item.incentivo_rede ?? 0);
  const txServ       = Number(item.taxa_servico ?? 0);
  const txEntrega    = Number(item.valor_taxa_entrega ?? 0);
  const liquido      = Number(item.valor_liquido ?? 0);
  const comissao     = fatPDV - liquido;
  const pctRepasse   = fatPDV > 0 ? Math.round(liquido / fatPDV * 100) : 0;
  const status       = item.divergencia_tipo || "nenhuma";

  return (
    <div className="px-4 pb-4 pt-3 border-t bg-muted/10 space-y-4">

      {/* PDV × iFood lado a lado */}
      <div className="grid grid-cols-[1fr_44px_1fr] gap-3 items-start">

        {/* LADO PDV */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            PDV — caixa registrou
          </p>
          <Campo label="Total em Produtos (PDV)" valor={bruto} destaque />
          {descLoja > 0 && (
            <Campo label="Desconto loja (PDV)" valor={-descLoja} cor="text-amber-600" />
          )}
          <Campo label="Total faturado (PDV)" valor={fatPDV} cor="text-blue-700" />
        </div>

        {/* Centro */}
        <div className="flex flex-col items-center justify-center pt-7 gap-1">
          {status === "nenhuma" || status === "conciliado" ? (
            <><Equal className="h-5 w-5 text-emerald-600" /><span className="text-[10px] text-emerald-600 font-medium">OK</span></>
          ) : (
            <><XCircle className="h-5 w-5 text-amber-500" /><span className="text-[10px] text-amber-600 font-medium">DIFF</span></>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground mt-1" />
        </div>

        {/* LADO iFood */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
            Extrato iFood
          </p>
          <Campo label="Valor dos itens (iFood)" valor={bruto} destaque />
          <Campo label="Taxas e comissões" valor={taxas} cor="text-red-600" />
          <Campo label="Incentivo iFood" valor={incIfood} cor="text-emerald-600" hideZero />
          <Campo label="Incentivo loja" valor={descLoja} cor="text-amber-600" hideZero />
          <Campo label="Incentivo rede" valor={incRede} cor="text-amber-600" hideZero />
          <Campo label="Taxa de serviço" valor={txServ} cor="text-emerald-600" hideZero />
          <Campo label="Taxa de entrega (retida)" valor={txEntrega} cor="text-muted-foreground" hideZero />
        </div>
      </div>

      {/* Resultado */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">PDV esperava receber</p>
            <p className="text-base font-bold text-blue-700">{fmtBRL(fatPDV)}</p>
          </div>
          <div className="border-x border-primary/20">
            <p className="text-[10px] text-muted-foreground mb-1">Comissão iFood</p>
            <p className="text-base font-bold text-red-600">− {fmtBRL(Math.abs(comissao))}</p>
            {fatPDV > 0 && <p className="text-[10px] text-muted-foreground">{Math.round(Math.abs(comissao)/fatPDV*100)}% do bruto</p>}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Vai entrar na conta</p>
            <p className="text-base font-bold text-emerald-600">{fmtBRL(liquido)}</p>
          </div>
        </div>

        {/* Barra */}
        {fatPDV > 0 && (
          <div className="mt-3">
            <div className="flex h-3 rounded-full overflow-hidden bg-muted gap-0.5">
              <div className="bg-emerald-500 rounded-l-full flex items-center justify-center"
                style={{ width: `${Math.max(pctRepasse, 5)}%` }}>
                {pctRepasse > 15 && <span className="text-[9px] text-white font-bold">{pctRepasse}%</span>}
              </div>
              <div className="bg-red-400 rounded-r-full flex items-center justify-center"
                style={{ width: `${Math.min(100 - pctRepasse, 95)}%` }}>
                {(100 - pctRepasse) > 8 && <span className="text-[9px] text-white font-bold">{100-pctRepasse}%</span>}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>Repasse ({pctRepasse}%)</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"/>Comissão iFood ({100-pctRepasse}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Alerta divergência */}
      {status !== "nenhuma" && status !== "conciliado" && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{item.tratativa_observacao || `Divergência: ${status.replace(/_/g, " ")}`}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t">
        <span>📅 {item.data_transacao}</span>
        <span>💳 {item.forma_pagamento || "—"}</span>
        <span>🏪 {item.loja || "—"}</span>
        <span className="font-mono">#{item.numero_pedido}</span>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────

export function ReconciliationDashboard() {
  const { user } = useAuth();
  const [selectedMarcaKey, setSelectedMarcaKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  // Marcas disponíveis
  const { data: marcaOptions = [] } = useQuery({
    queryKey: ["conciliacao-marcas", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statement_items")
        .select("marca, loja")
        .eq("user_id", user!.id)
        .eq("source_type", "extrato")
        .not("marca", "is", null);
      if (error) throw error;
      const set = new Map<string, string>();
      (data || []).forEach((i: any) => {
        if (i.marca) set.set(i.marca, i.loja || i.marca);
      });
      return Array.from(set.entries()).map(([marca, loja]) => ({
        value: marca, label: `${marca} — ${loja}`,
      }));
    },
    enabled: !!user,
  });

  const selectedMarca = selectedMarcaKey;

  // Datas disponíveis para a marca
  const { data: dateOptions = [] } = useQuery({
    queryKey: ["conciliacao-dates", selectedMarca],
    queryFn: async () => {
      if (!selectedMarca) return [];
      const { data, error } = await supabase
        .from("statement_items")
        .select("data_transacao")
        .eq("user_id", user!.id)
        .eq("source_type", "extrato")
        .eq("marca", selectedMarca);
      if (error) throw error;
      const dates = [...new Set((data || []).map((i: any) => String(i.data_transacao)))].sort().reverse();
      return dates;
    },
    enabled: !!selectedMarca,
    onSuccess: (dates: string[]) => {
      if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
    },
  });

  // Itens do dia selecionado
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["conciliacao-items", selectedMarca, selectedDate],
    queryFn: async () => {
      if (!selectedMarca || !selectedDate) return [];
      const { data, error } = await supabase
        .from("statement_items")
        .select("*")
        .eq("user_id", user!.id)
        .eq("source_type", "extrato")
        .eq("marca", selectedMarca)
        .eq("data_transacao", selectedDate)
        .order("numero_pedido");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedMarca && !!selectedDate,
  });

  // Totais — mesma lógica do calcularResumo, sem recalcular
  const totais = useMemo(() => {
    const ativos = items.filter((i: any) => i.order_status !== "cancelado");
    const cancelados = items.filter((i: any) => i.order_status === "cancelado");
    const sum = (key: string, arr = ativos) =>
      arr.reduce((s: number, i: any) => s + Number(i[key] ?? 0), 0);

    const bruto   = sum("valor_pdv");
    const liquido = sum("valor_liquido");
    const conciliados = ativos.filter((i: any) =>
      !i.divergencia_tipo || i.divergencia_tipo === "nenhuma"
    ).length;

    return {
      total: items.length,
      ativos: ativos.length,
      cancelados: cancelados.length,
      conciliados,
      divergentes: ativos.filter((i: any) =>
        i.divergencia_tipo && i.divergencia_tipo !== "nenhuma"
      ).length,
      bruto,
      liquido,
      comissao: bruto - liquido,
      taxas:       sum("taxas_comissoes"),
      incIfood:    sum("incentivo_ifood"),
      incLoja:     sum("incentivo_loja"),
      txServico:   sum("taxa_servico"),
      txEntrega:   sum("valor_taxa_entrega"),
      pct: ativos.length ? Math.round(conciliados / ativos.length * 100) : 0,
      valCancelado: cancelados.reduce((s: number, i: any) => s + Number(i.valor_pdv ?? 0), 0),
    };
  }, [items]);

  // Filtros
  const itensFiltrados = useMemo(() => {
    let list = items as any[];
    if (filtro === "divergencias") list = list.filter(i => i.divergencia_tipo && i.divergencia_tipo !== "nenhuma");
    else if (filtro === "conciliado") list = list.filter(i => !i.divergencia_tipo || i.divergencia_tipo === "nenhuma");
    else if (filtro === "cancelado") list = list.filter(i => i.order_status === "cancelado");
    if (search) list = list.filter(i =>
      String(i.numero_pedido || "").includes(search) ||
      String(i.loja || "").toLowerCase().includes(search.toLowerCase())
    );
    // Divergências primeiro
    return [...list].sort((a, b) => {
      const hasA = a.divergencia_tipo && a.divergencia_tipo !== "nenhuma" ? 0 : 1;
      const hasB = b.divergencia_tipo && b.divergencia_tipo !== "nenhuma" ? 0 : 1;
      return hasA - hasB;
    });
  }, [items, filtro, search]);

  const toggleExpand = (id: string) =>
    setExpandido(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── RENDER ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Marca</p>
              <Select value={selectedMarcaKey} onValueChange={v => { setSelectedMarcaKey(v); setSelectedDate(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {marcaOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Dia</p>
              <Select value={selectedDate} onValueChange={setSelectedDate} disabled={!selectedMarca}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {dateOptions.map(d => {
                    const [y, m, day] = d.split("-");
                    return <SelectItem key={d} value={d}>{`${day}/${m}/${y}`}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Buscar pedido</p>
              <div className="relative">
                <Input placeholder="Nº pedido..." value={search} onChange={e => setSearch(e.target.value)}
                  className="h-9 pl-3" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estado vazio */}
      {!selectedMarca && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Selecione uma marca para ver a conciliação.</p>
        </div>
      )}

      {selectedMarca && !selectedDate && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Selecione um dia para visualizar.</p>
        </div>
      )}

      {/* Dados */}
      {selectedMarca && selectedDate && !isLoading && items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Nenhum registro encontrado para {selectedMarca} em {selectedDate}.</p>
          <p className="text-xs mt-1">Importe os arquivos na aba Importar primeiro.</p>
        </div>
      )}

      {selectedDate && items.length > 0 && (
        <>
          {/* KPIs — idênticos ao preview do import */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className={totais.pct === 100 ? "border-emerald-300 bg-emerald-50/50" : ""}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Conciliados</p>
                <p className={`text-2xl font-bold mt-0.5 ${totais.pct === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                  {totais.pct}%
                </p>
                <p className="text-xs text-muted-foreground">{totais.conciliados} de {totais.ativos} · {selectedMarca}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total bruto (itens)</p>
                <p className="text-xl font-bold mt-0.5">{fmtBRL(totais.bruto)}</p>
                <p className="text-xs text-muted-foreground">{totais.ativos} pedidos ativos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Comissão iFood</p>
                <p className="text-xl font-bold text-red-600 mt-0.5">
                  − {fmtBRL(Math.abs(totais.comissao))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totais.bruto > 0 ? `${Math.round(Math.abs(totais.comissao)/totais.bruto*100)}% do bruto` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/30">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Repasse iFood</p>
                <p className="text-xl font-bold text-primary mt-0.5">{fmtBRL(totais.liquido)}</p>
                <p className="text-xs text-muted-foreground">entra na conta</p>
              </CardContent>
            </Card>
          </div>

          {/* Campos iFood discriminados */}
          {(totais.incIfood !== 0 || totais.txServico !== 0 || totais.cancelados > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {totais.incIfood !== 0 && (
                <Card><CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Incentivo iFood</p>
                  <p className="text-lg font-bold text-emerald-600">+{fmtBRL(totais.incIfood)}</p>
                  <p className="text-xs text-muted-foreground">subsídio plataforma</p>
                </CardContent></Card>
              )}
              {totais.incLoja !== 0 && (
                <Card><CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Incentivo loja</p>
                  <p className="text-lg font-bold text-amber-600">−{fmtBRL(totais.incLoja)}</p>
                  <p className="text-xs text-muted-foreground">custo bancado pela loja</p>
                </CardContent></Card>
              )}
              {totais.txServico !== 0 && (
                <Card><CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Taxa de serviço</p>
                  <p className="text-lg font-bold text-emerald-600">+{fmtBRL(totais.txServico)}</p>
                  <p className="text-xs text-muted-foreground">repasse ao restaurante</p>
                </CardContent></Card>
              )}
              {totais.cancelados > 0 && (
                <Card className="border-slate-200"><CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground">Cancelados</p>
                  <p className="text-lg font-bold text-slate-500">{totais.cancelados} pedido(s)</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(totais.valCancelado)} excluído dos totais</p>
                </CardContent></Card>
              )}
            </div>
          )}

          {/* Filtros */}
          <div className="flex gap-2 flex-wrap items-center">
            {[
              { k: "todos",       l: `Todos (${items.length})` },
              { k: "divergencias",l: `⚠️ Divergências (${totais.divergentes})` },
              { k: "conciliado",  l: `✅ OK (${totais.conciliados})` },
              { k: "cancelado",   l: `Cancelados (${totais.cancelados})` },
            ].map(f => (
              <button key={f.k} onClick={() => setFiltro(f.k)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtro === f.k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-muted-foreground"}`}>
                {f.l}
              </button>
            ))}
            <button onClick={() => setExpandido(new Set(itensFiltrados.map((i: any) => i.id)))}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground ml-auto">
              ↕ Expandir tudo
            </button>
            <button onClick={() => setExpandido(new Set())}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground">
              Recolher
            </button>
          </div>

          {/* Lista de pedidos — mesmo layout do import */}
          <div className="space-y-2">
            {itensFiltrados.map((item: any) => {
              const status = item.divergencia_tipo || "nenhuma";
              const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] || STATUS_CFG.nenhuma;
              const isOpen = expandido.has(item.id);
              const bruto = Number(item.valor_pdv ?? 0);
              const liquido = Number(item.valor_liquido ?? 0);
              const descLoja = Number(item.incentivo_loja ?? 0);
              const fatPDV = bruto - descLoja;
              const comissao = fatPDV - liquido;
              const pctRepasse = fatPDV > 0 ? Math.round(liquido / fatPDV * 100) : 0;

              return (
                <div key={item.id} className="border rounded-xl overflow-hidden bg-card shadow-sm">
                  <div className={`h-1 ${cfg.bar}`} />
                  <button
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => toggleExpand(item.id)}
                  >
                    <cfg.Icon className={`h-4 w-4 shrink-0 ${
                      status === "nenhuma" || status === "conciliado" ? "text-emerald-600"
                      : status === "cancelado" ? "text-muted-foreground"
                      : "text-amber-600"}`} />

                    <span className="font-mono text-xs text-muted-foreground shrink-0 w-10">
                      #{item.numero_pedido}
                    </span>

                    <Badge variant="outline" className={`text-xs shrink-0 ${cfg.cls}`}>
                      {cfg.label}
                    </Badge>

                    <span className="text-xs text-muted-foreground truncate flex-1 hidden sm:block">
                      {item.loja}
                    </span>

                    {/* PDV → iFood inline */}
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs">
                      <span className="text-blue-700 font-mono">{fmtBRL(fatPDV)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-emerald-600 font-mono font-semibold">{fmtBRL(liquido)}</span>
                      {comissao > 0.05 && (
                        <span className="text-red-500 text-[10px]">(−{fmtBRL(comissao)})</span>
                      )}
                    </div>

                    {/* Mini barra */}
                    {bruto > 0 && (
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        <div className="flex h-2 w-14 rounded-full overflow-hidden bg-muted">
                          <div className="bg-emerald-500 rounded-l-full" style={{ width: `${pctRepasse}%` }} />
                          <div className="bg-red-400 rounded-r-full" style={{ width: `${100-pctRepasse}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{pctRepasse}%</span>
                      </div>
                    )}

                    {isOpen
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {isOpen && <DetalhesPedido item={item} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
