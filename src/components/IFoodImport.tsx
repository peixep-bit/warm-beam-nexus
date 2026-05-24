/**
 * IFoodImport.tsx — v4
 * Preview com cruzamento visual PDV × Extrato iFood por pedido
 * Cada pedido mostra os dois lados + os 9 campos financeiros + comissão
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
  ArrowRight, Equal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Status config ─────────────────────────────────────────────

const STATUS_CFG = {
  conciliado:             { label: "Conciliado",           cls: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500",  Icon: CheckCircle2  },
  divergente_valor:       { label: "Divergência de valor", cls: "bg-amber-100 text-amber-800",     bar: "bg-amber-500",    Icon: AlertTriangle },
  divergente_status:      { label: "Status conflitante",   cls: "bg-red-100 text-red-800",         bar: "bg-red-500",      Icon: XCircle       },
  nao_encontrado_pdv:     { label: "Sem PDV",              cls: "bg-orange-100 text-orange-800",   bar: "bg-orange-500",   Icon: AlertTriangle },
  nao_encontrado_extrato: { label: "Sem extrato",          cls: "bg-orange-100 text-orange-800",   bar: "bg-orange-400",   Icon: AlertTriangle },
  cancelado:              { label: "Cancelado",            cls: "bg-slate-100 text-slate-600",     bar: "bg-slate-400",    Icon: XCircle       },
  sob_demanda:            { label: "Sob Demanda",          cls: "bg-blue-100 text-blue-800",       bar: "bg-blue-500",     Icon: Info          },
} as const;

// ─── FileDropZone ──────────────────────────────────────────────

function FileDropZone({ label, sublabel, file, onFile, tag }: {
  label: string; sublabel: string; file: File | null;
  onFile: (f: File) => void; tag?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
        ${drag ? "border-primary bg-primary/5"
          : file ? "border-emerald-400 bg-emerald-50/40"
          : "border-border hover:border-primary/40"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {file ? (
        <div className="flex items-center gap-2 justify-center">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {tag}</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 ml-auto" />
        </div>
      ) : (
        <>
          <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
        </>
      )}
    </div>
  );
}

// ─── Bloco de campo financeiro ─────────────────────────────────

function Campo({ label, valor, cor = "", destaque = false, hidden = false }: {
  label: string; valor: number; cor?: string; destaque?: boolean; hidden?: boolean;
}) {
  if (hidden && valor === 0) return null;
  return (
    <div className={`rounded-lg px-3 py-2 border ${destaque ? "border-primary/30 bg-primary/5" : "border-border/50 bg-background"}`}>
      <p className="text-[10px] text-muted-foreground mb-0.5 leading-tight">{label}</p>
      <p className={`text-sm font-semibold font-mono ${destaque ? "text-base" : ""} ${cor || "text-foreground"}`}>
        {valor === 0 ? <span className="text-muted-foreground/40">R$ 0,00</span> : fmtBRL(valor)}
      </p>
    </div>
  );
}

// ─── Preview expandido: PDV × Extrato iFood ───────────────────

function DetalhesPedido({ item }: { item: ReconciliacaoItem }) {
  const comissao = item.divergencia_repasse; // = total_faturado_pdv - valor_liquido_ifood

  return (
    <div className="px-4 pb-4 pt-3 border-t bg-muted/10 space-y-4">

      {/* Cruzamento PDV vs iFood */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">

        {/* LADO A — PDV */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            PDV — o que o caixa registrou
          </p>
          <Campo label="Valor dos itens (PDV)" valor={item.valor_itens_ifood} destaque />
          {(item.desconto_loja_pdv ?? 0) > 0 && (
            <Campo label="Desconto loja (PDV)" valor={-(item.desconto_loja_pdv ?? 0)} cor="text-amber-600" />
          )}
          <Campo label="Total faturado (PDV)" valor={item.total_faturado_pdv} cor="text-blue-700" />
        </div>

        {/* Cruzamento central */}
        <div className="flex flex-col items-center justify-center pt-6 gap-1">
          {item.status === "conciliado" ? (
            <>
              <Equal className="h-5 w-5 text-emerald-600" />
              <span className="text-[10px] text-emerald-600 font-medium">OK</span>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-amber-500" />
              <span className="text-[10px] text-amber-600 font-medium">DIFF</span>
            </>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground mt-1" />
        </div>

        {/* LADO B — iFood */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
            Extrato iFood — o que a plataforma repassa
          </p>
          <Campo label="Valor dos itens (iFood)" valor={item.valor_itens_ifood} destaque />
          <Campo label="Taxas e comissões" valor={item.taxas_comissoes ?? 0} cor="text-red-600" />
          <Campo label="Incentivo iFood" valor={item.incentivo_ifood ?? 0} cor="text-emerald-600" hidden />
          <Campo label="Incentivo loja" valor={item.incentivo_loja ?? 0} cor="text-amber-600" hidden />
          <Campo label="Incentivo rede" valor={item.incentivo_rede ?? 0} cor="text-amber-600" hidden />
          <Campo label="Taxa de serviço" valor={item.taxa_servico ?? 0} cor="text-emerald-600" hidden />
          <Campo label="Taxa de entrega (retida)" valor={item.taxa_entrega ?? 0} cor="text-muted-foreground" hidden />
        </div>
      </div>

      {/* Resultado do cruzamento */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mb-1">PDV esperava receber</p>
            <p className="text-base font-bold text-blue-700">{fmtBRL(item.total_faturado_pdv || item.valor_itens_ifood)}</p>
          </div>
          <div className="text-center border-x border-primary/20">
            <p className="text-[10px] text-muted-foreground mb-1">Comissão iFood</p>
            <p className="text-base font-bold text-red-600">− {fmtBRL(comissao)}</p>
            <p className="text-[10px] text-muted-foreground">
              {item.valor_itens_ifood > 0 ? `${Math.round(comissao / item.valor_itens_ifood * 100)}% do bruto` : ""}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Vai entrar na conta</p>
            <p className="text-base font-bold text-emerald-600">{fmtBRL(item.valor_liquido_ifood)}</p>
          </div>
        </div>

        {/* Barra proporcional */}
        {item.valor_itens_ifood > 0 && (
          <div className="mt-3">
            <div className="flex h-3 rounded-full overflow-hidden bg-muted gap-0.5">
              <div
                className="bg-emerald-500 rounded-l-full transition-all flex items-center justify-center"
                style={{ width: `${Math.max(Math.round(item.valor_liquido_ifood / item.valor_itens_ifood * 100), 5)}%` }}
              >
                {Math.round(item.valor_liquido_ifood / item.valor_itens_ifood * 100) > 15 && (
                  <span className="text-[9px] text-white font-bold">
                    {Math.round(item.valor_liquido_ifood / item.valor_itens_ifood * 100)}%
                  </span>
                )}
              </div>
              <div
                className="bg-red-400 rounded-r-full transition-all flex items-center justify-center"
                style={{ width: `${Math.min(Math.round(comissao / item.valor_itens_ifood * 100), 95)}%` }}
              >
                {Math.round(comissao / item.valor_itens_ifood * 100) > 10 && (
                  <span className="text-[9px] text-white font-bold">
                    {Math.round(comissao / item.valor_itens_ifood * 100)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>Repasse ({Math.round(item.valor_liquido_ifood / item.valor_itens_ifood * 100)}%)</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"/>Comissão iFood ({Math.round(comissao / item.valor_itens_ifood * 100)}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Alerta de divergência */}
      {item.motivo && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{item.motivo}</span>
        </div>
      )}

      {/* Auditoria do cálculo */}
      {item.liquido_metodo && item.liquido_metodo !== "base" && item.liquido_metodo !== "cancelado" && (
        <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2 text-xs text-blue-700">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {item.liquido_metodo === "base_mais_inc_loja" && (
            <span>Incentivo loja de <strong>{fmtBRL(item.liquido_ajuste ?? 0)}</strong> foi reintegrado ao repasse pelo iFood.</span>
          )}
          {item.liquido_metodo === "base_mais_inc_ifood" && (
            <span>Incentivo iFood de <strong>{fmtBRL(item.liquido_ajuste ?? 0)}</strong> foi reintegrado ao repasse.</span>
          )}
          {item.liquido_metodo === "ifood_fonte_verdade" && (
            <span>Diferença residual não explicada por incentivos — usando valor líquido iFood como fonte de verdade.</span>
          )}
        </div>
      )}

      {/* Metadados */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t">
        <span>📅 {item.data_transacao}</span>
        <span>💳 {item.forma_pagamento || "—"}</span>
        <span>🏪 {item.loja || "—"}</span>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────

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
    p => p.slug?.includes("ifood") || p.name?.toLowerCase().includes("ifood")
  );

  const toggleKey = (key: string) => setExpandido(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const processar = useCallback(async () => {
    if (!fileExtrato && !filePDV) { setErro("Envie pelo menos um arquivo."); return; }
    setErro(null);
    setStep("processando");
    try {
      const [extrato, pdv] = await Promise.all([
        fileExtrato ? parseIFoodExtrato(fileExtrato) : Promise.resolve([]),
        filePDV ? parseIFoodPDV(filePDV) : Promise.resolve([]),
      ]);
      setMarcaDetectada(pdv.find(p => p.marca)?.marca || "");
      setLojaDetectada(pdv.find(p => p.loja)?.loja || extrato.find(e => e.loja)?.loja || "");
      const resultado = reconciliar(extrato, pdv);
      setItems(resultado);
      setResumo(calcularResumo(resultado));
      // Expandir os primeiros 3 automaticamente
      setExpandido(new Set(resultado.slice(0, 3).map(i => i.id_curto + i.data_transacao)));
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

      const datas = items.map(i => i.data_transacao).filter(Boolean).sort();
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
        }).select().single();
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
    setFileExtrato(null); setFilePDV(null); setItems([]); setResumo(null);
    setFiltro("todos"); setExpandido(new Set()); setErro(null); setStep("upload");
    setMarcaDetectada(""); setLojaDetectada("");
  };

  const itensFiltrados = filtro === "todos" ? items
    : filtro === "divergencias"
      ? items.filter(i => ["divergente_valor","divergente_status","nao_encontrado_pdv","nao_encontrado_extrato"].includes(i.status))
      : items.filter(i => i.status === filtro);

  // ── RENDER ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* UPLOAD */}
      {(step === "upload" || step === "processando") && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  📄 Extrato iFood <span className="text-muted-foreground/60">(Portal → Relatórios → Pedidos)</span>
                </p>
                <FileDropZone label="Soltar ou clicar para selecionar" sublabel=".xlsx exportado do portal iFood"
                  tag="Extrato" file={fileExtrato} onFile={setFileExtrato} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  🖥️ Relatório PDV <span className="text-muted-foreground/60">(ERP → Integração iFood → Exportar)</span>
                </p>
                <FileDropZone label="Soltar ou clicar para selecionar" sublabel=".xlsx exportado do seu PDV"
                  tag="PDV" file={filePDV} onFile={setFilePDV} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-center text-muted-foreground bg-muted/30 rounded-lg p-3">
              <div><p className="font-medium text-foreground mb-0.5">🖥️ PDV</p><p>Valor dos itens</p><p>Total faturado</p></div>
              <div className="flex flex-col items-center justify-center">
                <ArrowRight className="h-4 w-4 text-primary mb-1" />
                <p className="font-medium text-foreground">Cruzamento</p>
                <p>Itens PDV = iFood?</p>
              </div>
              <div><p className="font-medium text-foreground mb-0.5">📄 iFood</p><p>9 campos financeiros</p><p>Repasse + comissão</p></div>
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
                : <><Upload className="h-4 w-4 mr-2" />Processar — ver PDV × iFood por pedido</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PREVIEW */}
      {(step === "preview" || step === "salvando") && resumo && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className={resumo.pct_conciliado === 100 ? "border-emerald-300 bg-emerald-50/50" : ""}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Conciliados</p>
                <p className={`text-2xl font-bold mt-0.5 ${resumo.pct_conciliado === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                  {resumo.pct_conciliado}%
                </p>
                <p className="text-xs text-muted-foreground">{resumo.conciliados} de {resumo.total_pedidos} · {marcaDetectada}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total bruto (itens)</p>
                <p className="text-xl font-bold mt-0.5">{fmtBRL(resumo.total_bruto_ifood)}</p>
                <p className="text-xs text-muted-foreground">{resumo.total_pedidos} pedidos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Comissão iFood total</p>
                <p className="text-xl font-bold text-red-600 mt-0.5">
                  − {fmtBRL(resumo.total_bruto_ifood - resumo.total_liquido_ifood)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resumo.total_bruto_ifood > 0
                    ? `${Math.round((resumo.total_bruto_ifood - resumo.total_liquido_ifood) / resumo.total_bruto_ifood * 100)}% do bruto`
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/30">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Repasse iFood</p>
                <p className="text-xl font-bold text-primary mt-0.5">{fmtBRL(resumo.total_liquido_ifood)}</p>
                <p className="text-xs text-muted-foreground">entra na conta</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros + ações */}
          <div className="flex gap-2 flex-wrap items-center">
            {[
              { k: "todos",        l: `Todos (${items.length})` },
              { k: "divergencias", l: `⚠️ Divergências (${resumo.divergentes})` },
              { k: "conciliado",   l: `✅ OK (${resumo.conciliados})` },
              { k: "cancelado",    l: `Cancelados (${resumo.cancelados})` },
              { k: "sob_demanda",  l: `Sob Demanda (${resumo.sob_demanda})` },
            ].map(f => (
              <button key={f.k} onClick={() => setFiltro(f.k)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtro === f.k ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/50 text-muted-foreground"}`}>
                {f.l}
              </button>
            ))}
            <button
              onClick={() => setExpandido(new Set(itensFiltrados.map(i => i.id_curto + i.data_transacao)))}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground ml-auto"
            >↕ Expandir tudo</button>
            <button
              onClick={() => setExpandido(new Set())}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground"
            >Recolher</button>
          </div>

          {/* Lista de pedidos */}
          <div className="space-y-2">
            {itensFiltrados.map((item) => {
              const cfg = STATUS_CFG[item.status];
              const key = item.id_curto + item.data_transacao;
              const isOpen = expandido.has(key);
              const pctRepasse = item.valor_itens_ifood > 0
                ? Math.round(item.valor_liquido_ifood / item.valor_itens_ifood * 100) : 0;
              const comissao = item.divergencia_repasse;

              return (
                <div key={key} className="border rounded-xl overflow-hidden bg-card shadow-sm">
                  {/* Barra de status */}
                  <div className={`h-1 ${cfg.bar}`} />

                  {/* Linha compacta — sempre visível */}
                  <button
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => toggleKey(key)}
                  >
                    <cfg.Icon className={`h-4 w-4 shrink-0 ${
                      item.status === "conciliado" ? "text-emerald-600"
                      : item.status === "cancelado" ? "text-muted-foreground"
                      : item.status === "sob_demanda" ? "text-blue-600"
                      : "text-amber-600"}`} />

                    <span className="font-mono text-xs text-muted-foreground shrink-0 w-10">#{item.id_curto}</span>

                    <Badge variant="outline" className={`text-xs shrink-0 ${cfg.cls}`}>{cfg.label}</Badge>

                    <span className="text-xs text-muted-foreground truncate flex-1 hidden sm:block">{item.loja}</span>

                    {/* PDV → iFood em linha */}
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs">
                      <span className="text-blue-700 font-mono">{fmtBRL(item.total_faturado_pdv || item.valor_itens_ifood)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-emerald-600 font-mono font-semibold">{fmtBRL(item.valor_liquido_ifood)}</span>
                      {comissao > 0 && (
                        <span className="text-red-500 text-[10px]">(−{fmtBRL(comissao)})</span>
                      )}
                    </div>

                    {/* Mini barra proporcional */}
                    {item.valor_itens_ifood > 0 && (
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        <div className="flex h-2 w-14 rounded-full overflow-hidden bg-muted">
                          <div className="bg-emerald-500 rounded-l-full" style={{ width: `${pctRepasse}%` }} />
                          <div className="bg-red-400 rounded-r-full" style={{ width: `${100 - pctRepasse}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{pctRepasse}%</span>
                      </div>
                    )}

                    {isOpen
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {/* Detalhe expandido */}
                  {isOpen && <DetalhesPedido item={item} />}
                </div>
              );
            })}
          </div>

          {/* Ações */}
          <div className="flex gap-3 sticky bottom-4 pt-2">
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
            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto my-4">
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-xs text-muted-foreground">Bruto</p>
                <p className="font-semibold text-sm">{fmtBRL(resumo.total_bruto_ifood)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2.5">
                <p className="text-xs text-muted-foreground">Comissão iFood</p>
                <p className="font-semibold text-sm text-red-600">− {fmtBRL(resumo.total_bruto_ifood - resumo.total_liquido_ifood)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-2.5">
                <p className="text-xs text-muted-foreground">Repasse</p>
                <p className="font-semibold text-sm text-emerald-600">{fmtBRL(resumo.total_liquido_ifood)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              <span className="text-emerald-600 font-medium">{resumo.pct_conciliado}% conciliados</span>
              {resumo.divergentes > 0 && <> · <span className="text-amber-600 font-medium">{resumo.divergentes} divergências para tratar</span></>}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={reiniciar}><Upload className="h-4 w-4 mr-2" />Nova importação</Button>
              {resumo.divergentes > 0 && (
                <Button onClick={() => {
                  const datas = items.filter(i => i.data_transacao).map(i => i.data_transacao).sort();
                  onVerDivergencias?.({ data_inicio: datas[0], data_fim: datas[datas.length - 1], status: "nao_tratado" });
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
