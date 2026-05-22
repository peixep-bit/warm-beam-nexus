/**
 * IFoodImport.tsx — v3
 * Preview visual completo com os 9 campos financeiros por pedido
 */

import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { NavigationFilter } from "@/hooks/useNavigation";
import {
  parseIFoodExtrato, parseIFoodPDV, reconciliar, calcularResumo,
  fmtBRL, ReconciliacaoItem, ResumoReconciliacao,
} from "@/lib/ifood-parser";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle,
  Info, ChevronDown, ChevronUp, RotateCcw, Save, Loader2,
  TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Status config ────────────────────────────────────────────

const STATUS_CFG = {
  conciliado:            { label: "Conciliado",           cls: "bg-emerald-100 text-emerald-800 border-emerald-200", Icon: CheckCircle2,  bar: "bg-emerald-500" },
  divergente_valor:      { label: "Divergência de valor", cls: "bg-amber-100 text-amber-800 border-amber-200",       Icon: AlertTriangle,  bar: "bg-amber-500"   },
  divergente_status:     { label: "Status conflitante",   cls: "bg-red-100 text-red-800 border-red-200",             Icon: XCircle,        bar: "bg-red-500"     },
  nao_encontrado_pdv:    { label: "Sem PDV",              cls: "bg-orange-100 text-orange-800 border-orange-200",    Icon: AlertTriangle,  bar: "bg-orange-500"  },
  nao_encontrado_extrato:{ label: "Sem extrato",          cls: "bg-orange-100 text-orange-800 border-orange-200",    Icon: AlertTriangle,  bar: "bg-orange-400"  },
  cancelado:             { label: "Cancelado",            cls: "bg-slate-100 text-slate-600 border-slate-200",       Icon: XCircle,        bar: "bg-slate-400"   },
  sob_demanda:           { label: "Sob Demanda",          cls: "bg-blue-100 text-blue-800 border-blue-200",          Icon: Info,           bar: "bg-blue-500"    },
} as const;

// ─── FileDropZone ──────────────────────────────────────────────────

function FileDropZone({ label, sublabel, file, onFile }: {
  label: string; sublabel: string; file: File | null; onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
        ${drag ? "border-primary bg-primary/5" : file ? "border-emerald-400 bg-emerald-50/50" : "border-border hover:border-primary/40"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {file ? (
        <div className="flex items-center gap-2 justify-center">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <div className="text-left">
            <p className="text-sm font-medium truncate max-w-[180px]">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
        </div>
      ) : (
        <><Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{sublabel}</p></>
      )}
    </div>
  );
}

// ─── Barra de composição financeira ───────────────────────────────

function BarraFinanceira({ item }: { item: ReconciliacaoItem }) {
  const bruto = item.valor_itens_ifood;
  if (bruto <= 0) return null;
  const taxas = Math.abs(item.taxas_comissoes ?? 0);
  const incIF = item.incentivo_ifood ?? 0;
  const incLj = Math.abs(item.incentivo_loja ?? 0);
  const entrega = item.taxa_entrega ?? 0;
  const liquido = item.valor_liquido_ifood;
  const pctTaxas = Math.round(taxas / bruto * 100);
  const pctLiq = Math.round(liquido / bruto * 100);

  return (
    <div className="mt-3 space-y-1.5">
      {/* Barra visual */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
        <div className="bg-emerald-500 rounded-l-full transition-all" style={{ flex: Math.max(liquido, 0) }} title={`Repasse ${fmtBRL(liquido)}`} />
        <div className="bg-red-400 transition-all" style={{ flex: taxas }} title={`Taxas ${fmtBRL(-taxas)}`} />
        {incLj > 0 && <div className="bg-amber-400 transition-all" style={{ flex: incLj }} title={`Inc. loja ${fmtBRL(-incLj)}`} />}
        {entrega > 0 && <div className="bg-slate-300 rounded-r-full transition-all" style={{ flex: entrega }} title={`Entrega ${fmtBRL(entrega)}`} />}
      </div>
      {/* Legenda compacta */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>{pctLiq}% repasse</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>{pctTaxas}% taxas iFood</span>
        {incIF > 0 && <span className="flex items-center gap-1 text-emerald-600"><TrendingUp className="h-3 w-3"/>+{fmtBRL(incIF)} inc. iFood</span>}
        {incLj > 0 && <span className="flex items-center gap-1 text-amber-600"><TrendingDown className="h-3 w-3"/>-{fmtBRL(incLj)} inc. loja</span>}
      </div>
    </div>
  );
}

// ─── Card de detalhes financeiros por pedido ──────────────────────

function CardDetalheFinanceiro({ item }: { item: ReconciliacaoItem }) {
  const campos = [
    { label: "Valor dos itens",        valor: item.valor_itens_ifood,          cor: "text-foreground",        icon: null,          destaque: true },
    { label: "Total pago pelo cliente",valor: item.valor_itens_ifood + (item.taxa_entrega ?? 0), cor: "text-muted-foreground",  icon: null, destaque: false },
    { label: "Taxa de entrega cliente",valor: item.taxa_entrega ?? 0,          cor: "text-muted-foreground",  icon: <Minus className="h-3 w-3 text-slate-400"/>, destaque: false },
    { label: "Incentivo iFood",        valor: item.incentivo_ifood ?? 0,       cor: "text-emerald-600",       icon: <TrendingUp className="h-3 w-3 text-emerald-500"/>, destaque: false },
    { label: "Incentivo loja",         valor: item.incentivo_loja ?? 0,        cor: "text-amber-600",         icon: <TrendingDown className="h-3 w-3 text-amber-500"/>, destaque: false },
    { label: "Incentivo rede",         valor: item.incentivo_rede ?? 0,        cor: "text-amber-600",         icon: <TrendingDown className="h-3 w-3 text-amber-500"/>, destaque: false },
    { label: "Taxa de serviço",        valor: item.taxa_servico ?? 0,          cor: "text-emerald-600",       icon: <TrendingUp className="h-3 w-3 text-emerald-500"/>, destaque: false },
    { label: "Taxas e comissões",      valor: item.taxas_comissoes ?? 0,       cor: "text-red-600",           icon: <TrendingDown className="h-3 w-3 text-red-500"/>, destaque: false },
    { label: "Valor líquido (repasse)",valor: item.valor_liquido_ifood,        cor: "text-emerald-600",       icon: null, destaque: true },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 mt-3">
      {campos.map((c) => (
        <div key={c.label} className={`rounded-lg p-2.5 border ${c.destaque ? "bg-muted/60 border-border" : "bg-background border-border/50"}`}>
          <div className="flex items-center gap-1 mb-1">
            {c.icon}
            <p className="text-[10px] text-muted-foreground leading-tight">{c.label}</p>
          </div>
          <p className={`text-sm font-semibold font-mono ${c.destaque ? "text-base" : ""} ${c.cor}`}>
            {c.valor < 0 ? fmtBRL(c.valor) : c.valor === 0 ? <span className="text-muted-foreground/50">—</span> : fmtBRL(c.valor)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────

type Step = "upload" | "processando" | "preview" | "salvando" | "concluido";

export function IFoodImport({ onVerDivergencias }: {
  onVerDivergencias?: (f: NavigationFilter) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [fileExtrato, setFileExtrato] = useState<File | null>(null);
  const [filePDV, setFilePDV] = useState<File | null>(null);
  const [items, setItems] = useState<ReconciliacaoItem[]>([]);
  const [resumo, setResumo] = useState<ResumoReconciliacao | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [marcaDetectada, setMarcaDetectada] = useState("");
  const [lojaDetectada, setLojaDetectada] = useState("");

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platforms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const ifoodPlatform = platforms.find(
    (p) => p.slug?.includes("ifood") || p.name?.toLowerCase().includes("ifood")
  );

  const toggleExpand = (key: string) => {
    setExpandido(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const processar = useCallback(async () => {
    if (!fileExtrato && !filePDV) { setErro("Envie pelo menos um arquivo."); return; }
    setErro(null);
    setStep("processando");
    try {
      const [extrato, pdv] = await Promise.all([
        fileExtrato ? parseIFoodExtrato(fileExtrato) : Promise.resolve([]),
        filePDV ? parseIFoodPDV(filePDV) : Promise.resolve([]),
      ]);
      const marca = pdv.find(p => p.marca)?.marca || "";
      const loja  = pdv.find(p => p.loja)?.loja || extrato.find(e => e.loja)?.loja || "";
      setMarcaDetectada(marca);
      setLojaDetectada(loja);
      const resultado = reconciliar(extrato, pdv);
      setItems(resultado);
      setResumo(calcularResumo(resultado));
      setStep("preview");
    } catch (e) {
      setErro(`Erro: ${e instanceof Error ? e.message : String(e)}`);
      setStep("upload");
    }
  }, [fileExtrato, filePDV]);

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");
      const platformId = ifoodPlatform?.id ?? platforms[0]?.id;
      if (!platformId) throw new Error("Plataforma iFood não encontrada. Cadastre-a em Plataformas.");

      const entregues = items.filter(i => i.status !== "sob_demanda" && i.valor_itens_ifood > 0);
      const datas = entregues.map(i => i.data_transacao).filter(Boolean).sort();

      const { data: imp, error: impErr } = await supabase
        .from("statement_imports")
        .insert({
          user_id: user.id,
          platform_id: platformId,
          file_name: fileExtrato?.name ?? filePDV?.name ?? "iFood Import",
          period_start: datas[0] ?? null,
          period_end: datas[datas.length - 1] ?? null,
          total_bruto: resumo?.total_bruto_ifood ?? 0,
          total_taxas: resumo ? -(resumo.total_bruto_ifood - resumo.total_liquido_ifood) : 0,
          total_descontos: 0,
          total_repasse: resumo?.total_liquido_ifood ?? 0,
          status: "processado",
          source_type: "extrato",
          marca: marcaDetectada || null,
          loja: lojaDetectada || null,
        })
        .select().single();
      if (impErr) throw impErr;

      const rows = items.map(i => ({
        import_id: imp.id,
        user_id: user.id,
        data_transacao: i.data_transacao || new Date().toISOString().split("T")[0],
        loja: i.loja || lojaDetectada,
        marca: marcaDetectada || null,
        descricao: i.forma_pagamento || i.status,
        valor_pdv: i.valor_itens_ifood,
        valor_bruto: i.valor_itens_ifood,
        valor_liquido: i.valor_liquido_ifood,
        taxas_comissoes: i.taxas_comissoes ?? 0,
        incentivo_ifood: i.incentivo_ifood ?? 0,
        incentivo_loja: i.incentivo_loja ?? 0,
        incentivo_rede: i.incentivo_rede ?? 0,
        taxa_servico: i.taxa_servico ?? 0,
        valor_taxa_entrega: i.taxa_entrega ?? 0,
        divergencia_valor: Math.abs(i.divergencia_repasse),
        divergencia_tipo: i.status === "conciliado" ? "nenhuma" : i.status,
        tratativa_status: "nao_tratado",
        numero_pedido: i.id_curto,
        forma_pagamento: i.forma_pagamento,
        source_type: "extrato",
        order_status: i.status === "cancelado" ? "cancelado" : "entregue",
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("statement_items").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-items"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setStep("concluido");
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
      setStep("preview");
    },
  });

  const reiniciar = () => {
    setFileExtrato(null); setFilePDV(null);
    setItems([]); setResumo(null);
    setFiltro("todos"); setExpandido(new Set());
    setErro(null); setStep("upload");
    setMarcaDetectada(""); setLojaDetectada("");
  };

  const itensFiltrados = filtro === "todos" ? items
    : filtro === "divergencias"
      ? items.filter(i => ["divergente_valor","divergente_status","nao_encontrado_pdv","nao_encontrado_extrato"].includes(i.status))
      : items.filter(i => i.status === filtro);

  // ── RENDER ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* UPLOAD */}
      {(step === "upload" || step === "processando") && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {marcaDetectada && (
              <div className="text-xs text-muted-foreground">
                Última importação: <strong>{marcaDetectada}</strong> · {lojaDetectada}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Extrato iFood</p>
                <FileDropZone label="Relatório de Pedidos" sublabel="Portal iFood → Relatórios → Pedidos"
                  file={fileExtrato} onFile={setFileExtrato} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Relatório PDV</p>
                <FileDropZone label="Exportação do PDV" sublabel="ERP/PDV → Integração iFood → Exportar"
                  file={filePDV} onFile={setFilePDV} />
              </div>
            </div>
            <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Você verá o detalhamento completo de cada pedido — itens, taxas, incentivos e repasse — antes de confirmar o import.</p>
            </div>
            {erro && (
              <div className="flex gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-xs">
                <XCircle className="h-4 w-4 shrink-0" />{erro}
              </div>
            )}
            <Button className="w-full" onClick={processar}
              disabled={(!fileExtrato && !filePDV) || step === "processando"}>
              {step === "processando"
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
                : <><Upload className="h-4 w-4 mr-2" />Processar e ver detalhes</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PREVIEW */}
      {(step === "preview" || step === "salvando") && resumo && (
        <>
          {/* KPIs + info detecção */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Conciliados</p>
                <p className="text-2xl font-bold text-emerald-600 mt-0.5">{resumo.pct_conciliado}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">{resumo.conciliados} pedidos</p>
              </CardContent>
            </Card>
            <Card className={resumo.divergentes > 0 ? "border-amber-200 bg-amber-50/50" : ""}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Divergências</p>
                <p className={`text-2xl font-bold mt-0.5 ${resumo.divergentes > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{resumo.divergentes}</p>
                <p className="text-xs text-muted-foreground mt-0.5">requerem atenção</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total bruto</p>
                <p className="text-xl font-bold mt-0.5">{fmtBRL(resumo.total_bruto_ifood)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{resumo.total_pedidos} pedidos · {marcaDetectada || "—"}</p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Repasse iFood</p>
                <p className="text-xl font-bold text-primary mt-0.5">{fmtBRL(resumo.total_liquido_ifood)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comissão: {fmtBRL(resumo.total_bruto_ifood - resumo.total_liquido_ifood)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {[
              { k: "todos",       l: `Todos (${items.length})` },
              { k: "divergencias",l: `⚠️ Divergências (${resumo.divergentes})` },
              { k: "conciliado",  l: `✅ OK (${resumo.conciliados})` },
              { k: "cancelado",   l: `Cancelados (${resumo.cancelados})` },
              { k: "sob_demanda", l: `Sob Demanda (${resumo.sob_demanda})` },
            ].map(f => (
              <button key={f.k} onClick={() => setFiltro(f.k)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtro === f.k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                {f.l}
              </button>
            ))}
            <button
              onClick={() => setExpandido(new Set(itensFiltrados.map(i => i.id_curto)))}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 ml-auto"
            >
              Expandir tudo
            </button>
          </div>

          {/* Lista de pedidos */}
          <div className="space-y-2">
            {itensFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhum item neste filtro.</p>
            )}
            {itensFiltrados.map((item) => {
              const cfg = STATUS_CFG[item.status];
              const key = item.id_curto + item.data_transacao;
              const isOpen = expandido.has(key);
              const pctRepasse = item.valor_itens_ifood > 0
                ? Math.round(item.valor_liquido_ifood / item.valor_itens_ifood * 100) : 0;

              return (
                <div key={key} className="border rounded-xl overflow-hidden bg-card">
                  {/* Linha de status colorida no topo */}
                  <div className={`h-1 ${cfg.bar}`} />

                  {/* Header do pedido */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(key)}
                  >
                    <cfg.Icon className={`h-4 w-4 shrink-0 ${
                      item.status === "conciliado" ? "text-emerald-600"
                      : item.status === "cancelado" ? "text-muted-foreground"
                      : item.status === "sob_demanda" ? "text-blue-600"
                      : "text-amber-600"}`} />
                    <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">#{item.id_curto}</span>
                    <Badge variant="outline" className={`text-xs shrink-0 ${cfg.cls}`}>{cfg.label}</Badge>
                    <span className="text-xs text-muted-foreground hidden sm:block truncate flex-1">{item.loja}</span>
                    <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{item.data_transacao}</span>

                    {/* Mini barra de composição inline */}
                    {item.valor_itens_ifood > 0 && (
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                        <div className="flex h-1.5 w-16 rounded-full overflow-hidden bg-muted">
                          <div className="bg-emerald-500" style={{ width: `${pctRepasse}%` }} />
                          <div className="bg-red-400" style={{ width: `${100 - pctRepasse}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{pctRepasse}%</span>
                      </div>
                    )}

                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-semibold">{fmtBRL(item.valor_liquido_ifood)}</p>
                      {item.valor_itens_ifood > 0 && item.valor_itens_ifood !== item.valor_liquido_ifood && (
                        <p className="text-xs text-muted-foreground">{fmtBRL(item.valor_itens_ifood)} bruto</p>
                      )}
                    </div>
                    {isOpen
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {/* Detalhe expandido — os 9 campos */}
                  {isOpen && (
                    <div className="px-4 pb-4 border-t bg-muted/10">
                      <CardDetalheFinanceiro item={item} />
                      <BarraFinanceira item={item} />

                      {item.motivo && (
                        <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-3 text-xs text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{item.motivo}
                        </div>
                      )}

                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>📅 {item.data_transacao}</span>
                        <span>💳 {item.forma_pagamento || "—"}</span>
                        {item.divergencia_repasse !== 0 && (
                          <span className="text-red-600 font-medium">
                            Comissão iFood: {fmtBRL(item.divergencia_repasse)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ações */}
          <div className="flex gap-3 sticky bottom-4">
            <Button variant="outline" onClick={reiniciar} disabled={step === "salvando"}>
              <RotateCcw className="h-4 w-4 mr-2" />Recomeçar
            </Button>
            <Button className="flex-1" onClick={() => salvarMutation.mutate()}
              disabled={step === "salvando"}>
              {step === "salvando"
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                : <><Save className="h-4 w-4 mr-2" />Confirmar e salvar {items.length} registros</>}
            </Button>
          </div>
        </>
      )}

      {/* CONCLUÍDO */}
      {step === "concluido" && resumo && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-14 w-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Importação concluída</h2>
            <p className="text-sm text-muted-foreground mb-2">
              {items.length} registros salvos
            </p>
            {/* Resumo financeiro final */}
            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto mb-5 text-sm">
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-xs text-muted-foreground">Bruto</p>
                <p className="font-semibold">{fmtBRL(resumo.total_bruto_ifood)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-2.5">
                <p className="text-xs text-muted-foreground">Repasse</p>
                <p className="font-semibold text-emerald-600">{fmtBRL(resumo.total_liquido_ifood)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2.5">
                <p className="text-xs text-muted-foreground">Comissão</p>
                <p className="font-semibold text-red-600">{fmtBRL(resumo.total_bruto_ifood - resumo.total_liquido_ifood)}</p>
              </div>
            </div>
            <p className="text-sm text-emerald-600 font-medium mb-5">
              {resumo.pct_conciliado}% conciliados
              {resumo.divergentes > 0 && <span className="text-amber-600"> · {resumo.divergentes} divergências</span>}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={reiniciar}>
                <Upload className="h-4 w-4 mr-2" />Nova importação
              </Button>
              {resumo.divergentes > 0 && (
                <Button onClick={() => {
                  const datas = items.filter(i => i.data_transacao).map(i => i.data_transacao).sort();
                  if (onVerDivergencias) onVerDivergencias({
                    data_inicio: datas[0], data_fim: datas[datas.length - 1], status: "nao_tratado",
                  });
                }}>
                  <AlertTriangle className="h-4 w-4 mr-2" />Ver {resumo.divergentes} divergências
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
