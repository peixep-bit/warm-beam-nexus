/**
 * IFoodFechamento.tsx
 * Fechamento de período iFood: Consolidado · Lançamento Everest · Divergências
 * Lê dados do Supabase (statement_items + statement_imports).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtBRL } from "@/lib/ifood-parser";
import {
  CheckCircle2, AlertTriangle, XCircle, Copy, Check,
  ChevronRight, ChevronDown, TrendingUp, TrendingDown,
  Info, Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Hook de dados ────────────────────────────────────────────

function useFechamentoData(periodoStart: string, periodoEnd: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ifood-fechamento", periodoStart, periodoEnd, user?.id],
    enabled: !!user && !!periodoStart,
    queryFn: async () => {
      // Buscar itens do extrato iFood no período
      const { data: extrato, error } = await supabase
        .from("statement_items")
        .select(`
          data_transacao, loja, valor_pdv, valor_bruto, valor_liquido,
          taxas_comissoes, incentivo_ifood, incentivo_loja, incentivo_rede,
          taxa_servico, valor_taxa_entrega, divergencia_valor, divergencia_tipo,
          numero_pedido, order_status, tratativa_status
        `)
        .eq("user_id", user!.id)
        .eq("source_type", "extrato")
        .gte("data_transacao", periodoStart)
        .lte("data_transacao", periodoEnd)
        .order("data_transacao");

      if (error) throw error;

      // Agrupar por dia
      const byDay = new Map<string, typeof extrato>();
      (extrato ?? []).forEach((item) => {
        const d = item.data_transacao;
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d)!.push(item);
      });

      const dias = Array.from(byDay.entries()).map(([data, items]) => {
        const entregues = items.filter((i) => i.order_status !== "cancelado");
        return {
          data,
          pedidos: entregues.length,
          bruto: entregues.reduce((s, i) => s + (i.valor_pdv ?? 0), 0),
          taxas: entregues.reduce((s, i) => s + (i.taxas_comissoes ?? 0), 0),
          incIfood: entregues.reduce((s, i) => s + (i.incentivo_ifood ?? 0), 0),
          incLoja: entregues.reduce((s, i) => s + (i.incentivo_loja ?? 0), 0),
          taxaServico: entregues.reduce((s, i) => s + (i.taxa_servico ?? 0), 0),
          liquido: entregues.reduce((s, i) => s + (i.valor_liquido ?? 0), 0),
          entrega: entregues.reduce((s, i) => s + (i.valor_taxa_entrega ?? 0), 0),
        };
      });

      const divergencias = (extrato ?? []).filter(
        (i) => i.divergencia_tipo && i.divergencia_tipo !== "nenhuma"
      );

      return { dias, divergencias, total: extrato?.length ?? 0 };
    },
  });
}

// ─── CopyButton ───────────────────────────────────────────────

function CopyButton({ value }: { value: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value.toFixed(2)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all
        ${copied ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-border text-muted-foreground hover:bg-muted"}`}
    >
      {copied ? <><Check className="h-3 w-3" />Copiado</> : <><Copy className="h-3 w-3" />Copiar</>}
    </button>
  );
}

// ─── DiaRow expansível ────────────────────────────────────────

type FechamentoDia = NonNullable<ReturnType<typeof useFechamentoData>["data"]>["dias"][number];
function DiaRow({ dia }: { dia: FechamentoDia }) {
  const [open, setOpen] = useState(false);
  const taxa = dia.bruto > 0 ? ((1 - dia.liquido / dia.bruto) * 100).toFixed(1) : "—";

  return (
    <>
      <tr onClick={() => setOpen(!open)} className="cursor-pointer hover:bg-muted/30 transition-colors font-medium">
        <td className="px-3 py-2.5 text-sm">
          <span className="flex items-center gap-1.5">
            {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            {dia.data}
          </span>
        </td>
        <td className="px-3 py-2.5 text-sm text-right">{dia.pedidos}</td>
        <td className="px-3 py-2.5 text-sm text-right font-mono">{fmtBRL(dia.bruto)}</td>
        <td className="px-3 py-2.5 text-sm text-right font-mono text-red-600">{fmtBRL(dia.taxas)}</td>
        <td className="px-3 py-2.5 text-sm text-right font-mono text-emerald-600">{dia.incIfood > 0 ? fmtBRL(dia.incIfood) : "—"}</td>
        <td className="px-3 py-2.5 text-sm text-right font-mono text-amber-600">{dia.incLoja < 0 ? fmtBRL(dia.incLoja) : "—"}</td>
        <td className="px-3 py-2.5 text-sm text-right font-mono text-emerald-600 font-semibold">{fmtBRL(dia.liquido)}</td>
        <td className="px-3 py-2.5 text-sm text-right text-muted-foreground">{taxa}%</td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-6 py-3">
            <div className="grid grid-cols-5 gap-2 text-xs">
              {[
                { l: "Valor dos itens", v: dia.bruto,     cls: "" },
                { l: "Taxas/Comissões", v: dia.taxas,     cls: "text-red-600" },
                { l: "Incentivo iFood", v: dia.incIfood,  cls: "text-emerald-600" },
                { l: "Incentivo loja",  v: dia.incLoja,   cls: "text-amber-600" },
                { l: "= Repasse",       v: dia.liquido,   cls: "text-emerald-600 font-semibold" },
              ].map((f) => (
                <div key={f.l} className="bg-background rounded-lg px-3 py-2 border">
                  <p className="text-muted-foreground mb-0.5">{f.l}</p>
                  <p className={`font-mono ${f.cls}`}>{fmtBRL(f.v)}</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────

type Tab = "periodo" | "everest" | "divergencias";

interface Props {
  periodoStart?: string;
  periodoEnd?: string;
}

export function IFoodFechamento({ periodoStart: initStart = "", periodoEnd: initEnd = "" }: Props) {
  const [tab, setTab] = useState<Tab>("periodo");

  // Período controlado localmente — usuário pode ajustar
  const today = new Date().toISOString().split("T")[0];
  const defaultStart = initStart || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [periodoStart, setPeriodoStart] = useState(defaultStart);
  const [periodoEnd, setPeriodoEnd] = useState(initEnd || today);

  const { data, isLoading } = useFechamentoData(periodoStart, periodoEnd);

  if (isLoading) {
    return (
      <Card><CardContent className="pt-6 text-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
      </CardContent></Card>
    );
  }

  const dias = data?.dias ?? [];
  const divs = data?.divergencias ?? [];

  const totBruto   = dias.reduce((s, d) => s + d.bruto, 0);
  const totTaxas   = dias.reduce((s, d) => s + d.taxas, 0);
  const totIncIF   = dias.reduce((s, d) => s + d.incIfood, 0);
  const totIncLj   = dias.reduce((s, d) => s + d.incLoja, 0);
  const totLiq     = dias.reduce((s, d) => s + d.liquido, 0);
  const totEntrega = dias.reduce((s, d) => s + d.entrega, 0);
  const totPedidos = dias.reduce((s, d) => s + d.pedidos, 0);
  const resultado  = totLiq + totIncIF;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "periodo",      label: "Período consolidado" },
    { id: "everest",      label: "Lançamento Everest" },
    { id: "divergencias", label: "Divergências", badge: divs.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header com seletor de período */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fechamento do período</h2>
          <p className="text-xs text-muted-foreground mt-0.5">iFood · {periodoStart} a {periodoEnd}</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">De</label>
            <input type="date" value={periodoStart} onChange={e => setPeriodoStart(e.target.value)}
              className="h-8 text-xs px-2 border border-input rounded-md bg-background" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Até</label>
            <input type="date" value={periodoEnd} onChange={e => setPeriodoEnd(e.target.value)}
              className="h-8 text-xs px-2 border border-input rounded-md bg-background" />
          </div>
          <div className="flex gap-2 pb-0.5">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />{totPedidos} pedidos
            </Badge>
            {divs.length > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle className="h-3 w-3 mr-1" />{divs.length} divergências
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === t.id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB PERÍODO ── */}
      {tab === "periodo" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: "Vendas brutas",    v: totBruto,  c: "",               sub: `${totPedidos} pedidos` },
              { l: "Repasse iFood",    v: totLiq,    c: "text-emerald-600", sub: `taxa ${totBruto > 0 ? ((1-totLiq/totBruto)*100).toFixed(1) : 0}%` },
              { l: "Taxas/Comissões",  v: totTaxas,  c: "text-red-600",   sub: "descontadas" },
              { l: "Inc. iFood",       v: totIncIF,  c: "text-emerald-600", sub: "subsídio plataforma" },
            ].map((k) => (
              <Card key={k.l}><CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{k.l}</p>
                <p className={`text-lg font-semibold mt-0.5 ${k.c}`}>{fmtBRL(k.v)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    {["Data","Pedidos","Bruto","Taxas/Com.","Inc. iFood","Inc. loja","Repasse líq.","Taxa ef."].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 text-xs text-muted-foreground font-normal ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dias.map((d) => <DiaRow key={d.data} dia={d} />)}
                  <tr className="bg-muted/30 font-semibold border-t">
                    <td className="px-3 py-2.5 text-sm">Total</td>
                    <td className="px-3 py-2.5 text-sm text-right">{totPedidos}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono">{fmtBRL(totBruto)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-red-600">{fmtBRL(totTaxas)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-emerald-600">{fmtBRL(totIncIF)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-amber-600">{fmtBRL(totIncLj)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono text-emerald-600">{fmtBRL(totLiq)}</td>
                    <td className="px-3 py-2.5 text-sm text-right text-muted-foreground">
                      {totBruto > 0 ? `${((1-totLiq/totBruto)*100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── TAB EVEREST ── */}
      {tab === "everest" && (
        <>
          <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            Copie cada valor e lance no título correspondente no Everest Food Service.
          </div>

          <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Créditos
          </p>
          {[
            { l: "Repasse iFood — líquido recebido",    v: totLiq,   cls: "text-emerald-600" },
            { l: "Incentivo iFood — subsídio plataforma", v: totIncIF, cls: "text-emerald-600" },
          ].map((r) => (
            <Card key={r.l}><CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-sm">{r.l}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${r.cls}`}>{fmtBRL(r.v)}</span>
                <CopyButton value={r.v} />
              </div>
            </CardContent></Card>
          ))}

          <p className="text-xs font-medium text-red-700 flex items-center gap-1.5 mt-4">
            <TrendingDown className="h-3.5 w-3.5" /> Débitos
          </p>
          {[
            { l: "Taxas e comissões iFood",         v: Math.abs(totTaxas), cls: "text-red-600" },
            { l: "Incentivo loja (custo bancado)",   v: Math.abs(totIncLj), cls: "text-amber-600" },
            { l: "Taxa entrega (retida pelo iFood)", v: totEntrega,         cls: "text-muted-foreground" },
          ].map((r) => (
            <Card key={r.l}><CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-sm">{r.l}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${r.cls}`}>{fmtBRL(r.v)}</span>
                <CopyButton value={r.v} />
              </div>
            </CardContent></Card>
          ))}

          <Card className="border-primary/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <span className="font-semibold">Resultado líquido do período</span>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-emerald-600">{fmtBRL(resultado)}</span>
                <CopyButton value={resultado} />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── TAB DIVERGÊNCIAS ── */}
      {tab === "divergencias" && (
        <>
          {divs.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma divergência no período.</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {divs.length} pedidos com divergência. Valor total: {fmtBRL(divs.reduce((s, d) => s + (d.divergencia_valor ?? 0), 0))}.
              </div>
              {divs.map((d) => (
                <Card key={d.numero_pedido}>
                  <CardContent className="py-4 px-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        <AlertTriangle className="h-3 w-3 mr-1" />{d.divergencia_tipo?.replace(/_/g, " ")}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">#{d.numero_pedido}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{d.data_transacao}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { l: "Valor PDV",    v: fmtBRL(d.valor_pdv ?? 0) },
                        { l: "Repasse iFood",v: fmtBRL(d.valor_liquido ?? 0) },
                        { l: "Diferença",    v: fmtBRL(d.divergencia_valor ?? 0) },
                      ].map((f) => (
                        <div key={f.l} className="bg-muted/40 rounded-lg p-2.5">
                          <p className="text-muted-foreground mb-0.5">{f.l}</p>
                          <p className="font-medium">{f.v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <CopyButton value={d.divergencia_valor ?? 0} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
