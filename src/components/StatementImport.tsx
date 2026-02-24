import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseFile } from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle } from "lucide-react";

const MARCAS = ["Aima", "SU", "Outra"];

export function StatementImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platformId, setPlatformId] = useState("");
  const [sourceType, setSourceType] = useState<"extrato" | "pdv">("extrato");
  const [marca, setMarca] = useState("");
  const [fileName, setFileName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [loja, setLoja] = useState("");
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platforms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const rows = await parseFile(file);
      setParsedData(rows);
      toast({ title: `${rows.length} linhas encontradas` });
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!platformId || parsedData.length === 0) throw new Error("Selecione plataforma e arquivo");
      if (!marca) throw new Error("Selecione a marca");

      const sum = (key: string) => parsedData.reduce((s: number, r: any) => s + (r[key] ?? 0), 0);
      const dates = parsedData.map((r: any) => r.data_transacao).filter(Boolean).sort();

      const { data: imp, error: impErr } = await supabase.from("statement_imports").insert({
        user_id: user!.id,
        platform_id: platformId,
        file_name: fileName,
        cnpj: cnpj || null,
        loja: loja || null,
        total_bruto: sum("valor_bruto"),
        total_taxas: sum("taxa"),
        total_descontos: sum("desconto"),
        total_repasse: sum("valor_liquido"),
        period_start: dates[0] || null,
        period_end: dates[dates.length - 1] || null,
        status: "processado",
        source_type: sourceType,
        marca,
      }).select().single();
      if (impErr) throw impErr;

      const items = parsedData.map((r: any) => ({
        import_id: imp.id,
        user_id: user!.id,
        data_transacao: r.data_transacao,
        loja: r.loja || loja || null,
        cnpj: r.cnpj || cnpj || null,
        descricao: r.descricao,
        quantidade_pedidos: r.quantidade_pedidos,
        valor_pdv: r.valor_pdv,
        valor_bruto: r.valor_bruto,
        desconto: r.desconto,
        taxa: r.taxa,
        valor_taxa_entrega: r.valor_taxa_entrega,
        valor_liquido: r.valor_liquido,
        numero_pedido: r.numero_pedido,
        forma_pagamento: r.forma_pagamento,
        incentivo_ifood: r.incentivo_ifood,
        incentivo_loja: r.incentivo_loja,
        incentivo_rede: r.incentivo_rede,
        taxa_servico: r.taxa_servico,
        taxas_comissoes: r.taxas_comissoes,
        valor_liquido_conciliado: r.valor_liquido_conciliado,
        marca,
      }));

      const { error: itemsErr } = await supabase.from("statement_items").insert(items);
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-items"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Extrato importado!", description: "Vá para Conciliação para conferir." });
      setParsedData([]);
      setFileName("");
      setPlatformId("");
      setCnpj("");
      setLoja("");
      setMarca("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const sum = (key: string) => parsedData.reduce((s: number, r: any) => s + (r[key] ?? 0), 0);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as "extrato" | "pdv")}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="extrato">📄 Extrato</SelectItem>
                <SelectItem value="pdv">🖥️ PDV</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Plataforma</Label>
            <Select value={platformId} onValueChange={setPlatformId}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Marca</Label>
            <Select value={marca} onValueChange={setMarca}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {MARCAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">CNPJ</Label>
            <Input placeholder="00.000.000/0001-00" value={cnpj} onChange={e => setCnpj(e.target.value)} className="mt-1 h-9" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Loja (opcional)</Label>
            <Input placeholder="Ex: Pizzaria Central" value={loja} onChange={e => setLoja(e.target.value)} className="mt-1 h-9" />
          </div>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 cursor-pointer hover:border-primary/50 transition-colors">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {parsing ? "Processando..." : (fileName || "Selecionar .csv ou .xlsx")}
          </span>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>

        {parsedData.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            <span><strong>{parsedData.length}</strong> linhas · Itens: {fmt(sum("valor_pdv"))} · Líquido: {fmt(sum("valor_liquido"))}</span>
          </div>
        )}

        <Button
          onClick={() => importMutation.mutate()}
          disabled={!platformId || !marca || parsedData.length === 0 || importMutation.isPending || parsing}
          className="w-full"
          size="sm"
        >
          <Upload className="h-4 w-4 mr-2" />
          {importMutation.isPending ? "Importando..." : "Importar"}
        </Button>
      </CardContent>
    </Card>
  );
}
