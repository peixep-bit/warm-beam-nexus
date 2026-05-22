import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, XCircle, Download, RefreshCw, Copy, Check } from "lucide-react";
import { useState as useCopyState } from "react";

function CopyValorBtn({ value }: { value: number }) {
  const [copied, setCopied] = useCopyState(false);
  if (value <= 0.05) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value.toFixed(2)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-all ${copied ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-border text-muted-foreground hover:bg-muted"}`}
    >
      {copied ? <><Check className="h-3 w-3" />Copiado</> : <><Copy className="h-3 w-3" />{value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</>}
    </button>
  );
}
import {
  classificarPedidos,
  ROTULO_TIPO,
  ROTULO_TRATATIVA,
  type DivergenciaTipo,
  type TratativaStatus,
  type PedidoParaDivergencia,
} from "@/lib/divergencias";
import type { FeeRule } from "@/lib/calculo-conciliacao";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DivergenciasDashboard({
  filtroExterno = {},
  onClearFiltro,
}: {
  filtroExterno?: { marca?: string; data_inicio?: string; data_fim?: string; status?: string; tipo?: string };
  onClearFiltro?: () => void;
}) {
  const queryClient = useQueryClient();
  const [filtroTipo, setFiltroTipo] = useState<DivergenciaTipo | "todos">("todos");
  const [filtroStatus, setFiltroStatus] = useState<TratativaStatus | "todos">("todos");
  const [filtroMarca, setFiltroMarca] = useState<string>("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>("");
  const [filtroDataFim, setFiltroDataFim] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [reclassificando, setReclassificando] = useState(false);
  const [tratandoId, setTratandoId] = useState<string | null>(null);

  // Aplicar filtro externo quando chegar (vindo do IFoodImport)
  useEffect(() => {
    if (filtroExterno.marca) setFiltroMarca(filtroExterno.marca);
    if (filtroExterno.status) setFiltroStatus(filtroExterno.status as TratativaStatus);
    if (filtroExterno.tipo) setFiltroTipo(filtroExterno.tipo as DivergenciaTipo);
    if (filtroExterno.data_inicio) setFiltroDataInicio(filtroExterno.data_inicio);
    if (filtroExterno.data_fim) setFiltroDataFim(filtroExterno.data_fim);
  }, [filtroExterno]);


  // Carrega pedidos (limite 1000 conforme regra do projeto)
  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["divergencias_pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statement_items")
        .select(
          "id,numero_pedido,data_transacao,valor_pdv,valor_bruto,valor_liquido,taxas_comissoes,valor_taxa_entrega,desconto,incentivo_loja,marca,cnpj,loja,order_status,divergencia_tipo,divergencia_valor,tratativa_status,tratativa_observacao,tratativa_atualizada_em,source_type",
        )
        .order("data_transacao", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [] } = useQuery<FeeRule[]>({
    queryKey: ["fee_rules_all_for_divergencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_rules")
        .select("name,percentage,fixed_amount,base_field");
      if (error) throw error;
      return (data ?? []) as FeeRule[];
    },
  });

  // Reclassifica e persiste no banco
  async function reclassificarTudo() {
    setReclassificando(true);
    try {
      const resultados = classificarPedidos(pedidos as PedidoParaDivergencia[], rules);
      // Atualiza apenas os que mudaram
      const updates = resultados.filter((r, i) => {
        const original = pedidos[i] as any;
        return (
          original.divergencia_tipo !== r.divergencia_tipo ||
          Number(original.divergencia_valor ?? 0) !== r.divergencia_valor
        );
      });
      let ok = 0;
      for (const r of updates) {
        const { error } = await supabase
          .from("statement_items")
          .update({
            divergencia_tipo: r.divergencia_tipo,
            divergencia_valor: r.divergencia_valor,
          })
          .eq("id", r.id);
        if (!error) ok++;
      }
      toast.success(`${ok} pedidos reclassificados`);
      queryClient.invalidateQueries({ queryKey: ["divergencias_pedidos"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao reclassificar");
    } finally {
      setReclassificando(false);
    }
  }

  // Auto-classifica na primeira carga se nada estiver classificado ainda
  useEffect(() => {
    if (!isLoading && pedidos.length > 0 && rules) {
      const naoClassificados = pedidos.filter(
        (p: any) => !p.divergencia_tipo || p.divergencia_tipo === "nenhuma",
      ).length;
      if (naoClassificados === pedidos.length) {
        reclassificarTudo();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, pedidos.length, rules.length]);

  // Lista de marcas para filtro
  const marcas = useMemo(() => {
    const set = new Set<string>();
    pedidos.forEach((p: any) => p.marca && set.add(p.marca));
    return Array.from(set).sort();
  }, [pedidos]);

  // Filtra para a tabela
  const filtrados = useMemo(() => {
    return (pedidos as any[]).filter((p) => {
      if ((p.divergencia_tipo ?? "nenhuma") === "nenhuma") return false;
      if (filtroTipo !== "todos" && p.divergencia_tipo !== filtroTipo) return false;
      const ts = p.tratativa_status ?? "nao_tratado";
      if (filtroStatus !== "todos" && ts !== filtroStatus) return false;
      if (filtroMarca !== "todos" && p.marca !== filtroMarca) return false;
      if (filtroDataInicio && p.data_transacao < filtroDataInicio) return false;
      if (filtroDataFim && p.data_transacao > filtroDataFim) return false;
      if (busca) {
        const q = busca.toLowerCase();
        const hit =
          (p.numero_pedido ?? "").toString().toLowerCase().includes(q) ||
          (p.loja ?? "").toLowerCase().includes(q) ||
          (p.marca ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [pedidos, filtroTipo, filtroStatus, filtroMarca, filtroDataInicio, filtroDataFim, busca]);

  // KPIs
  const kpis = useMemo(() => {
    const ativos = (pedidos as any[]).filter(
      (p) => p.divergencia_tipo && p.divergencia_tipo !== "nenhuma",
    );
    const naoTratado = ativos.filter((p) => (p.tratativa_status ?? "nao_tratado") === "nao_tratado");
    const emContest = ativos.filter((p) => p.tratativa_status === "em_contestacao");
    const recuperado = ativos.filter((p) => p.tratativa_status === "recuperado");
    const cancelados = ativos.filter((p) => p.divergencia_tipo === "cancelamento_nao_reembolsado");
    const sum = (arr: any[]) => arr.reduce((a, p) => a + Number(p.divergencia_valor ?? 0), 0);
    return {
      aRecuperar: sum(naoTratado),
      emContestacao: sum(emContest),
      recuperado: sum(recuperado),
      cancelados: cancelados.length,
    };
  }, [pedidos]);

  function exportarCSV() {
    const header = [
      "Pedido", "Data", "Marca", "Loja", "Tipo", "Valor (R$)", "Status Tratativa", "Motivo/Observação",
    ];
    const linhas = filtrados.map((p) => [
      p.numero_pedido ?? "",
      p.data_transacao ?? "",
      p.marca ?? "",
      p.loja ?? "",
      ROTULO_TIPO[(p.divergencia_tipo ?? "nenhuma") as DivergenciaTipo],
      Number(p.divergencia_valor ?? 0).toFixed(2),
      ROTULO_TRATATIVA[(p.tratativa_status ?? "nao_tratado") as TratativaStatus],
      (p.tratativa_observacao ?? "").replace(/[\r\n;]/g, " "),
    ]);
    const csv = [header, ...linhas].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `divergencias_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tratando = tratandoId ? (pedidos as any[]).find((p) => p.id === tratandoId) : null;
  const temFiltroExterno = filtroDataInicio || filtroDataFim || (filtroMarca !== "todos");

  return (
    <div className="space-y-4">
      {/* Banner de filtro ativo vindo do import */}
      {temFiltroExterno && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
          <span>
            🔍 Mostrando divergências do import
            {filtroDataInicio && <> · <strong>{filtroDataInicio}</strong></>}
            {filtroDataFim && filtroDataFim !== filtroDataInicio && <> a <strong>{filtroDataFim}</strong></>}
            {filtroMarca !== "todos" && <> · <strong>{filtroMarca}</strong></>}
          </span>
          <button
            onClick={() => {
              setFiltroDataInicio("");
              setFiltroDataFim("");
              setFiltroMarca("todos");
              setFiltroStatus("todos");
              if (onClearFiltro) onClearFiltro();
            }}
            className="text-xs underline ml-4 hover:text-amber-900"
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="A recuperar"
          value={fmt(kpis.aRecuperar)}
          tone="warn"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Em contestação"
          value={fmt(kpis.emContestacao)}
          tone="info"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Recuperado"
          value={fmt(kpis.recuperado)}
          tone="success"
        />
        <KpiCard
          icon={<XCircle className="h-4 w-4" />}
          label="Cancel. sem reembolso"
          value={String(kpis.cancelados)}
          tone="danger"
        />
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-col md:flex-row gap-2 md:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <Input
              placeholder="Pedido, loja ou marca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="taxa_excedente">Taxa a maior</SelectItem>
                <SelectItem value="repasse_faltante">Repasse faltante</SelectItem>
                <SelectItem value="cancelamento_nao_reembolsado">Cancel. sem reembolso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tratativa</label>
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="nao_tratado">Não tratado</SelectItem>
                <SelectItem value="em_contestacao">Em contestação</SelectItem>
                <SelectItem value="recuperado">Recuperado</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Marca</label>
            <Select value={filtroMarca} onValueChange={setFiltroMarca}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {marcas.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={reclassificarTudo} disabled={reclassificando}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${reclassificando ? "animate-spin" : ""}`} />
              Reclassificar
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={exportarCSV} disabled={filtrados.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Pedido</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Marca/Loja</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2 font-medium text-right">Lançar Everest</th>
                <th className="px-3 py-2 font-medium">Tratativa</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>
              )}
              {!isLoading && filtrados.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma divergência encontrada com os filtros atuais.
                </td></tr>
              )}
              {filtrados.map((p) => {
                const tipo = (p.divergencia_tipo ?? "nenhuma") as DivergenciaTipo;
                const status = (p.tratativa_status ?? "nao_tratado") as TratativaStatus;
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono">{p.numero_pedido ?? "—"}</td>
                    <td className="px-3 py-2">{p.data_transacao}</td>
                    <td className="px-3 py-2">
                      <div>{p.marca ?? "—"}</div>
                      <div className="text-muted-foreground">{p.loja ?? ""}</div>
                    </td>
                    <td className="px-3 py-2"><BadgeTipo tipo={tipo} /></td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(Number(p.divergencia_valor ?? 0))}</td>
                    <td className="px-3 py-2 text-right"><CopyValorBtn value={Number(p.divergencia_valor ?? 0)} /></td>
                    <td className="px-3 py-2"><BadgeStatus status={status} /></td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTratandoId(p.id)}>
                        Tratar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {tratando && (
        <TratarDivergenciaModal
          pedido={tratando}
          onClose={() => setTratandoId(null)}
          onSaved={() => {
            setTratandoId(null);
            queryClient.invalidateQueries({ queryKey: ["divergencias_pedidos"] });
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: "warn" | "info" | "success" | "danger" }) {
  const toneClasses: Record<string, string> = {
    warn: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    info: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    success: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    danger: "text-red-600 bg-red-50 dark:bg-red-950/30",
  };
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className={`rounded-md p-1.5 ${toneClasses[tone]}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-base font-bold truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function BadgeTipo({ tipo }: { tipo: DivergenciaTipo }) {
  const map: Record<DivergenciaTipo, string> = {
    taxa_excedente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    repasse_faltante: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    cancelamento_nao_reembolsado: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
    nenhuma: "bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={`${map[tipo]} border-transparent text-[10px]`}>{ROTULO_TIPO[tipo]}</Badge>;
}

function BadgeStatus({ status }: { status: TratativaStatus }) {
  const map: Record<TratativaStatus, string> = {
    nao_tratado: "bg-muted text-muted-foreground",
    em_contestacao: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    recuperado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    perdido: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return <Badge variant="outline" className={`${map[status]} border-transparent text-[10px]`}>{ROTULO_TRATATIVA[status]}</Badge>;
}

function TratarDivergenciaModal({
  pedido, onClose, onSaved,
}: { pedido: any; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<TratativaStatus>(pedido.tratativa_status ?? "em_contestacao");
  const [observacao, setObservacao] = useState<string>(pedido.tratativa_observacao ?? "");
  const [valorRecuperado, setValorRecuperado] = useState<string>(String(pedido.divergencia_valor ?? 0));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const { error: e1 } = await supabase
        .from("statement_items")
        .update({
          tratativa_status: status,
          tratativa_observacao: observacao || null,
          tratativa_atualizada_em: new Date().toISOString(),
        })
        .eq("id", pedido.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("contestacoes").insert({
        user_id: userId,
        statement_item_id: pedido.id,
        valor_contestado: Number(pedido.divergencia_valor ?? 0),
        valor_recuperado: status === "recuperado" ? Number(valorRecuperado || 0) : 0,
        tipo: pedido.divergencia_tipo ?? "nenhuma",
        status,
        observacao: observacao || null,
        data_resolucao: status === "recuperado" || status === "perdido" ? new Date().toISOString() : null,
      });
      if (e2) throw e2;

      toast.success("Tratativa registrada");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Tratar divergência</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Pedido:</span> <span className="font-mono">{pedido.numero_pedido ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Tipo:</span> {ROTULO_TIPO[(pedido.divergencia_tipo ?? "nenhuma") as DivergenciaTipo]}</div>
            <div><span className="text-muted-foreground">Valor:</span> <strong>{fmt(Number(pedido.divergencia_valor ?? 0))}</strong></div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as TratativaStatus)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_tratado">Não tratado</SelectItem>
                <SelectItem value="em_contestacao">Em contestação</SelectItem>
                <SelectItem value="recuperado">Recuperado</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "recuperado" && (
            <div>
              <label className="text-xs text-muted-foreground">Valor recuperado (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={valorRecuperado}
                onChange={(e) => setValorRecuperado(e.target.value)}
                className="h-9"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Observação</label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              placeholder="Ex.: protocolo de contestação, retorno do iFood…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar tratativa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
