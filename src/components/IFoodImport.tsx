/**
 * IFoodImport.tsx
 * Componente de importação iFood integrado ao Supabase.
 * Substitui a aba "Importar" para pedidos iFood/99Food.
 * Usa o parser ifood-parser.ts com a fórmula correta de cruzamento.
 */

import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  parseIFoodExtrato,
  parseIFoodPDV,
  reconciliar,
  calcularResumo,
  fmtBRL,
  ReconciliacaoItem,
  ResumoReconciliacao,
} from "@/lib/ifood-parser";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  XCircle, Info, ChevronDown, ChevronUp,
  RotateCcw, Save, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Status config ────────────────────────────────────────────

const STATUS_CFG = {
  conciliado:            { label: "Conciliado",           cls: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2  },
  divergente_valor:      { label: "Divergência de valor", cls: "bg-amber-100 text-amber-800",    Icon: AlertTriangle },
  divergente_status:     { label: "Status conflitante",   cls: "bg-red-100 text-red-800",        Icon: XCircle       },
  nao_encontrado_pdv:    { label: "Sem PDV",              cls: "bg-orange-100 text-orange-800",  Icon: AlertTriangle },
  nao_encontrado_extrato:{ label: "Sem extrato",          cls: "bg-orange-100 text-orange-800",  Icon: AlertTriangle },
  cancelado:             { label: "Cancelado",            cls: "bg-slate-100 text-slate-600",    Icon: XCircle       },
  sob_demanda:           { label: "Sob Demanda",          cls: "bg-blue-100 text-blue-800",      Icon: Info          },
} as const;

// ─── FileDropZone ─────────────────────────────────────────────

function FileDropZone({
  label, sublabel, file, onFile,
}: { label: string; sublabel: string; file: File | null; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
        ${drag ? "border-primary bg-primary/5" : file ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/40"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {file ? (
        <div className="flex items-center gap-2 justify-center">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium truncate max-w-[180px]">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
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

// ─── Componente principal ─────────────────────────────────────

type Step = "upload" | "processando" | "preview" | "salvando" | "concluido";

export function IFoodImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [fileExtrato, setFileExtrato] = useState<File | null>(null);
  const [filePDV, setFilePDV] = useState<File | null>(null);
  const [items, setItems] = useState<ReconciliacaoItem[]>([]);
  const [resumo, setResumo] = useState<ResumoReconciliacao | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Platform iFood
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

  // Processar arquivos
  const processar = useCallback(async () => {
    if (!fileExtrato && !filePDV) { setErro("Envie pelo menos um arquivo."); return; }
    setErro(null);
    setStep("processando");
    try {
      const [extrato, pdv] = await Promise.all([
        fileExtrato ? parseIFoodExtrato(fileExtrato) : Promise.resolve([]),
        filePDV ? parseIFoodPDV(filePDV) : Promise.resolve([]),
      ]);
      const resultado = reconciliar(extrato, pdv);
      setItems(resultado);
      setResumo(calcularResumo(resultado));
      setStep("preview");
    } catch (e) {
      setErro(`Erro: ${e instanceof Error ? e.message : String(e)}`);
      setStep("upload");
    }
  }, [fileExtrato, filePDV]);

  // Salvar no Supabase
  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");
      const platformId = ifoodPlatform?.id ?? platforms[0]?.id;
      if (!platformId) throw new Error("Plataforma iFood não encontrada. Cadastre-a em Plataformas.");

      const extrato = items.filter((i) => i.status !== "sob_demanda" && i.valor_itens_ifood > 0);
      const datas = extrato.map((i) => i.data_transacao).sort();

      // Criar import
      const { data: imp, error: impErr } = await supabase
        .from("statement_imports")
        .insert({
          user_id: user.id,
          platform_id: platformId,
          file_name: fileExtrato?.name ?? filePDV?.name ?? "iFood Import",
          period_start: datas[0] ?? null,
          period_end: datas[datas.length - 1] ?? null,
          total_bruto: resumo?.total_bruto_ifood ?? 0,
          total_taxas: 0,
          total_descontos: 0,
          total_repasse: resumo?.total_liquido_ifood ?? 0,
          status: "processado",
          source_type: "extrato",
        })
        .select()
        .single();
      if (impErr) throw impErr;

      // Inserir itens em lotes de 500
      const rows = items.map((i) => ({
        import_id: imp.id,
        user_id: user.id,
        data_transacao: i.data_transacao || new Date().toISOString().split("T")[0],
        loja: i.loja,
        descricao: i.status,
        valor_pdv: i.valor_itens_ifood,
        valor_bruto: i.valor_itens_ifood,
        valor_liquido: i.valor_liquido_ifood,
        numero_pedido: i.id_curto,
        forma_pagamento: i.forma_pagamento,
        divergencia_valor: Math.abs(i.divergencia_repasse),
        divergencia_tipo: i.status === "conciliado" ? "nenhuma" : i.status,
        tratativa_status: "nao_tratado",
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
    setFiltro("todos"); setExpandido(null);
    setErro(null); setStep("upload");
  };

  const itensFiltrados = filtro === "todos" ? items
    : filtro === "divergencias"
      ? items.filter((i) => ["divergente_valor","divergente_status","nao_encontrado_pdv","nao_encontrado_extrato"].includes(i.status))
      : items.filter((i) => i.status === filtro);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* UPLOAD */}
      {(step === "upload" || step === "processando") && (
        <Card>
          <CardContent className="pt-6 space-y-4">
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
              <p>A divergência é calculada como <strong>Total Faturado PDV − Valor Líquido iFood</strong> — o valor exato a lançar no Everest.</p>
            </div>

            {erro && (
              <div className="flex gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-xs">
                <XCircle className="h-4 w-4 shrink-0" /> {erro}
              </div>
            )}

            <Button className="w-full" onClick={processar}
              disabled={(!fileExtrato && !filePDV) || step === "processando"}>
              {step === "processando"
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
                : <><Upload className="h-4 w-4 mr-2" />Processar e pré-visualizar</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PREVIEW */}
      {(step === "preview" || step === "salvando") && resumo && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Conciliados",   value: `${resumo.pct_conciliado}%`, sub: `${resumo.conciliados} pedidos`,        cls: "text-emerald-600" },
              { label: "Divergências",  value: resumo.divergentes,           sub: "requerem atenção",                    cls: resumo.divergentes > 0 ? "text-amber-600" : "text-muted-foreground" },
              { label: "Total bruto",   value: fmtBRL(resumo.total_bruto_ifood), sub: `${resumo.total_pedidos} pedidos`, cls: "" },
              { label: "Repasse iFood", value: fmtBRL(resumo.total_liquido_ifood), sub: resumo.diferenca_repasse !== 0
                  ? `Diff PDV: ${fmtBRL(Math.abs(resumo.diferenca_repasse))}` : "Sem diferença", cls: "text-primary" },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={`text-xl font-semibold mt-0.5 ${k.cls}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {[
              { k: "todos",       l: `Todos (${items.length})` },
              { k: "divergencias",l: `⚠️ Divergências (${resumo.divergentes})` },
              { k: "conciliado",  l: `✅ Conciliados (${resumo.conciliados})` },
              { k: "cancelado",   l: `Cancelados (${resumo.cancelados})` },
              { k: "sob_demanda", l: `Sob Demanda (${resumo.sob_demanda})` },
            ].map((f) => (
              <button key={f.k} onClick={() => setFiltro(f.k)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtro === f.k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                {f.l}
              </button>
            ))}
          </div>

          {/* Lista */}
          <div className="space-y-1.5">
            {itensFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhum item neste filtro.</p>
            )}
            {itensFiltrados.map((item) => {
              const cfg = STATUS_CFG[item.status];
              const isOpen = expandido === item.id_curto + item.data_transacao;
              return (
                <div key={item.id_curto + item.data_transacao + item.status}
                  className="border rounded-xl overflow-hidden">
                  <button className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandido(isOpen ? null : item.id_curto + item.data_transacao)}>
                    <cfg.Icon className={`h-4 w-4 shrink-0 ${item.status === "conciliado" ? "text-emerald-600" : item.status === "cancelado" ? "text-muted-foreground" : item.status === "sob_demanda" ? "text-blue-600" : "text-amber-600"}`} />
                    <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">#{item.id_curto}</span>
                    <Badge className={`text-xs shrink-0 ${cfg.cls}`} variant="outline">{cfg.label}</Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1 hidden sm:block">{item.loja}</span>
                    <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{item.data_transacao}</span>
                    <span className="text-sm font-medium ml-auto shrink-0">{fmtBRL(item.valor_liquido_ifood)}</span>
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                        {[
                          { l: "Itens iFood",     v: fmtBRL(item.valor_itens_ifood)  },
                          { l: "Faturado PDV",    v: item.total_faturado_pdv > 0 ? fmtBRL(item.total_faturado_pdv) : "—" },
                          { l: "Repasse líquido", v: fmtBRL(item.valor_liquido_ifood) },
                          { l: "Diff p/ Everest", v: Math.abs(item.divergencia_repasse) > 0.05 ? fmtBRL(item.divergencia_repasse) : "—" },
                        ].map((f) => (
                          <div key={f.l} className="bg-muted/40 rounded-lg p-2.5">
                            <p className="text-xs text-muted-foreground">{f.l}</p>
                            <p className="text-sm font-medium mt-0.5">{f.v}</p>
                          </div>
                        ))}
                      </div>
                      {item.motivo && (
                        <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-2.5 text-xs text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{item.motivo}
                        </div>
                      )}
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
            <p className="text-sm text-muted-foreground mb-5">
              {items.length} registros salvos ·{" "}
              <span className="text-emerald-600 font-medium">{resumo.pct_conciliado}% conciliados</span>
              {resumo.divergentes > 0 && (
                <> · <span className="text-amber-600 font-medium">{resumo.divergentes} divergências</span></>
              )}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={reiniciar}>
                <Upload className="h-4 w-4 mr-2" />Nova importação
              </Button>
              {resumo.divergentes > 0 && (
                <Button variant="default" onClick={() => {
                  // Navega para aba de divergências
                  document.querySelector<HTMLElement>('[value="divergencias"]')?.click();
                }}>
                  <AlertTriangle className="h-4 w-4 mr-2" />Ver divergências
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
