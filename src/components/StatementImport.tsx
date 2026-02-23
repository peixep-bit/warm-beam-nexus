import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseFile } from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet } from "lucide-react";

export function StatementImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platformId, setPlatformId] = useState("");
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

      const sum = (key: string) => parsedData.reduce((s: number, r: any) => s + (r[key] ?? 0), 0);

      const totalBruto = sum("valor_bruto");
      const totalTaxas = sum("taxa");
      const totalDescontos = sum("desconto");
      const totalRepasse = sum("valor_liquido");

      const dates = parsedData.map((r: any) => r.data_transacao).filter(Boolean).sort();

      const { data: imp, error: impErr } = await supabase.from("statement_imports").insert({
        user_id: user!.id,
        platform_id: platformId,
        file_name: fileName,
        cnpj: cnpj || null,
        loja: loja || null,
        total_bruto: totalBruto,
        total_taxas: totalTaxas,
        total_descontos: totalDescontos,
        total_repasse: totalRepasse,
        period_start: dates[0] || null,
        period_end: dates[dates.length - 1] || null,
        status: "processado",
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
      }));

      const { error: itemsErr } = await supabase.from("statement_items").insert(items);
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Extrato importado com sucesso!" });
      setParsedData([]);
      setFileName("");
      setPlatformId("");
      setCnpj("");
      setLoja("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
  const sum = (key: string) => parsedData.reduce((s: number, r: any) => s + (r[key] ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="h-5 w-5" /> Importar Extrato
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Plataforma</Label>
            <Select value={platformId} onValueChange={setPlatformId}>
              <SelectTrigger><SelectValue placeholder="Selecione a plataforma" /></SelectTrigger>
              <SelectContent>
                {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>CNPJ da Loja</Label>
            <Input
              placeholder="00.000.000/0001-00"
              value={cnpj}
              onChange={e => setCnpj(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Nome da Loja (opcional)</Label>
            <Input
              placeholder="Ex: Pizzaria Central"
              value={loja}
              onChange={e => setLoja(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Arquivo CSV ou Excel (.xlsx)</Label>
          <div className="mt-1">
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-primary/50 transition-colors">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {parsing ? "Processando..." : (fileName || "Clique para selecionar .csv ou .xlsx")}
              </span>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </div>

        {parsedData.length > 0 && (
          <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
            <p className="font-semibold text-foreground">{parsedData.length} linhas encontradas</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <p className="text-muted-foreground text-xs">Pedidos</p>
                <p className="font-medium">{sum("quantidade_pedidos")}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Valor Itens (PDV)</p>
                <p className="font-medium">{fmt(sum("valor_pdv"))}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Taxa Entrega Cliente</p>
                <p className="font-medium">{fmt(sum("valor_taxa_entrega"))}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Incentivo iFood</p>
                <p className="font-medium">{fmt(sum("incentivo_ifood"))}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Incentivo Loja</p>
                <p className="font-medium text-destructive">{fmt(sum("incentivo_loja"))}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Taxa Serviço</p>
                <p className="font-medium">{fmt(sum("taxa_servico"))}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Taxas e Comissões</p>
                <p className="font-medium text-destructive">{fmt(sum("taxas_comissoes"))}</p>
              </div>
              <div className="col-span-2 sm:col-span-4 border-t pt-2 mt-1 bg-primary/10 rounded p-2">
                <p className="text-muted-foreground text-xs font-semibold">💰 Líquido Conciliado (Itens + Inc. Loja + Comissões)</p>
                <p className="font-bold text-lg text-primary">{fmt(sum("valor_liquido_conciliado"))}</p>
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={() => importMutation.mutate()}
          disabled={!platformId || parsedData.length === 0 || importMutation.isPending || parsing}
          className="w-full"
        >
          {importMutation.isPending ? "Importando..." : "Importar Extrato"}
        </Button>
      </CardContent>
    </Card>
  );
}
