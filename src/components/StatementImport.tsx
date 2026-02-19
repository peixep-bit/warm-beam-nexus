import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseCSV } from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet } from "lucide-react";

export function StatementImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platformId, setPlatformId] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsedData, setParsedData] = useState<any[]>([]);

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platforms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setParsedData(rows);
      toast({ title: `${rows.length} linhas encontradas` });
    };
    reader.readAsText(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!platformId || parsedData.length === 0) throw new Error("Selecione plataforma e arquivo");

      const totalBruto = parsedData.reduce((s, r) => s + r.valor_bruto, 0);
      const totalTaxas = parsedData.reduce((s, r) => s + r.taxa, 0);
      const totalDescontos = parsedData.reduce((s, r) => s + r.desconto, 0);
      const totalRepasse = parsedData.reduce((s, r) => s + r.valor_liquido, 0);

      const dates = parsedData.map(r => r.data_transacao).filter(Boolean).sort();

      const { data: imp, error: impErr } = await supabase.from("statement_imports").insert({
        user_id: user!.id,
        platform_id: platformId,
        file_name: fileName,
        total_bruto: totalBruto,
        total_taxas: totalTaxas,
        total_descontos: totalDescontos,
        total_repasse: totalRepasse,
        period_start: dates[0] || null,
        period_end: dates[dates.length - 1] || null,
        status: "processado",
      }).select().single();
      if (impErr) throw impErr;

      const items = parsedData.map(r => ({
        import_id: imp.id,
        user_id: user!.id,
        ...r,
      }));

      const { error: itemsErr } = await supabase.from("statement_items").insert(items);
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      toast({ title: "Extrato importado com sucesso!" });
      setParsedData([]);
      setFileName("");
      setPlatformId("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="h-5 w-5" /> Importar Extrato
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <Label>Arquivo CSV</Label>
          <div className="mt-1">
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-primary/50 transition-colors">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {fileName || "Clique para selecionar um arquivo .csv"}
              </span>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </div>
        {parsedData.length > 0 && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p><strong>{parsedData.length}</strong> transações encontradas</p>
            <p>Total bruto: <strong>R$ {parsedData.reduce((s, r) => s + r.valor_bruto, 0).toFixed(2)}</strong></p>
            <p>Total taxas: <strong>R$ {parsedData.reduce((s, r) => s + r.taxa, 0).toFixed(2)}</strong></p>
            <p>Total líquido: <strong>R$ {parsedData.reduce((s, r) => s + r.valor_liquido, 0).toFixed(2)}</strong></p>
          </div>
        )}
        <Button onClick={() => importMutation.mutate()} disabled={!platformId || parsedData.length === 0 || importMutation.isPending} className="w-full">
          {importMutation.isPending ? "Importando..." : "Importar Extrato"}
        </Button>
      </CardContent>
    </Card>
  );
}
