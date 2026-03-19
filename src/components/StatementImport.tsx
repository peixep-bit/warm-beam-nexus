import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseFile, FileMetadata } from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle } from "lucide-react";

export function StatementImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platformId, setPlatformId] = useState("");
  const [sourceType, setSourceType] = useState<"extrato" | "pdv">("extrato");
  const [marca, setMarca] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileMetadata, setFileMetadata] = useState<FileMetadata>({});
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

  // Detect marcas from parsed file data
  const detectedMarcas = useMemo(() => {
    const set = new Set<string>();
    parsedData.forEach((r: any) => {
      if (r.marca) set.add(r.marca);
    });
    return Array.from(set).sort();
  }, [parsedData]);

  // Detect parceiro (platform) from parsed file data
  const detectedParceiro = useMemo(() => {
    const set = new Set<string>();
    parsedData.forEach((r: any) => {
      if (r.parceiro) set.add(r.parceiro);
    });
    return Array.from(set);
  }, [parsedData]);

  // Detect loja from parsed file data
  const detectedLoja = useMemo(() => {
    const set = new Set<string>();
    parsedData.forEach((r: any) => {
      if (r.loja) set.add(r.loja);
    });
    return Array.from(set);
  }, [parsedData]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const { rows, metadata } = await parseFile(file);
      setParsedData(rows);
      setFileMetadata(metadata);
      // Auto-detect loja from metadata or file data
      if (metadata.loja) {
        setLoja(metadata.loja);
      } else {
        const lojas = new Set(rows.map((r: any) => r.loja).filter(Boolean));
        if (lojas.size === 1) setLoja(Array.from(lojas)[0] as string);
      }
      toast({ title: `${rows.length} linhas encontradas` });
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  // Helper: match parceiro string to a platform id (fuzzy)
  const matchPlatform = (parceiro: string): string | null => {
    if (!parceiro) return null;
    const norm = parceiro.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const p of platforms) {
      const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (norm === pNorm || norm.includes(pNorm) || pNorm.includes(norm)) return p.id;
    }
    return null;
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (platforms.length === 0) throw new Error("Cadastre ao menos uma plataforma");
      if (parsedData.length === 0) throw new Error("Selecione um arquivo");

      // Filter by selected marca if applicable
      const dataToImport = (marca && marca !== "__all__")
        ? parsedData.filter((r: any) => r.marca === marca)
        : parsedData;

      if (dataToImport.length === 0) throw new Error("Nenhuma linha para a marca selecionada");

      // Group rows by parceiro (platform detected from file)
      const hasMultipleParceiros = detectedParceiro.length > 1;
      const groups = new Map<string, any[]>();

      if (hasMultipleParceiros) {
        // Group by parceiro field from file
        for (const row of dataToImport) {
          const parceiro = row.parceiro || "__default__";
          if (!groups.has(parceiro)) groups.set(parceiro, []);
          groups.get(parceiro)!.push(row);
        }
      } else {
        // Single group with the user-selected platform
        groups.set("__default__", dataToImport);
      }

      for (const [parceiro, rows] of groups) {
        // Resolve platform_id: match parceiro to platform, or use user selection
        let effectivePlatformId: string;
        if (parceiro !== "__default__") {
          const matched = matchPlatform(parceiro);
          if (matched) {
            effectivePlatformId = matched;
          } else {
            // Fallback to user-selected platform
            effectivePlatformId = (platformId && platformId !== "__all__") ? platformId : platforms[0]?.id;
          }
        } else {
          effectivePlatformId = (platformId && platformId !== "__all__") ? platformId : platforms[0]?.id;
        }
        if (!effectivePlatformId) throw new Error("Nenhuma plataforma disponível");

        const effectiveMarca = marca || detectedMarcas[0] || "";

        const sum = (key: string) => rows.reduce((s: number, r: any) => s + (r[key] ?? 0), 0);
        const dates = rows.map((r: any) => r.data_transacao).filter(Boolean).sort();

        const { data: imp, error: impErr } = await supabase.from("statement_imports").insert({
          user_id: user!.id,
          platform_id: effectivePlatformId,
          file_name: fileName + (parceiro !== "__default__" ? ` [${parceiro}]` : ""),
          loja: loja || fileMetadata.loja || null,
          cnpj: null,
          total_bruto: sum("valor_bruto"),
          total_taxas: sum("taxa"),
          total_descontos: sum("desconto"),
          total_repasse: sum("valor_liquido"),
          period_start: dates[0] || null,
          period_end: dates[dates.length - 1] || null,
          status: "processado",
          source_type: sourceType,
          marca: effectiveMarca,
        }).select().single();
        if (impErr) throw impErr;

        const items = rows.map((r: any) => ({
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
          marca: r.marca || effectiveMarca,
          source_type: sourceType,
        }));

        // Insert in batches of 500
        for (let i = 0; i < items.length; i += 500) {
          const batch = items.slice(i, i + 500);
          const { error: itemsErr } = await supabase.from("statement_items").insert(batch);
          if (itemsErr) throw itemsErr;
        }
      }
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
                <SelectItem value="__all__">📋 Todas</SelectItem>
                {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">CNPJ</Label>
            <Input placeholder="00.000.000/0001-00" value={cnpj} onChange={e => setCnpj(e.target.value)} className="mt-1 h-9" />
          </div>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 cursor-pointer hover:border-primary/50 transition-colors">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {parsing ? "Processando..." : (fileName || "Selecionar .csv ou .xlsx")}
          </span>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>

        {/* File detection info */}
        {parsedData.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p><strong>{parsedData.length}</strong> linhas · Itens: {fmt(sum("valor_pdv"))} · Líquido: {fmt(sum("valor_liquido"))}</p>
                {detectedLoja.length > 0 && (
                  <p className="text-xs text-muted-foreground">Loja: {detectedLoja.join(", ")}</p>
                )}
                {detectedParceiro.length > 0 && (
                  <p className="text-xs text-muted-foreground">Parceiro: {detectedParceiro.join(", ")}</p>
                )}
                {detectedMarcas.length > 0 && (
                  <p className="text-xs text-muted-foreground">Marcas: {detectedMarcas.join(", ")}</p>
                )}
              </div>
            </div>

            {/* Marca filter when multiple detected */}
            {detectedMarcas.length > 1 && (
              <div>
                <Label className="text-xs">Importar marca específica (opcional)</Label>
                <Select value={marca} onValueChange={setMarca}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Todas as marcas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas ({parsedData.length} linhas)</SelectItem>
                    {detectedMarcas.map(m => {
                      const count = parsedData.filter((r: any) => r.marca === m).length;
                      return <SelectItem key={m} value={m}>{m} ({count} linhas)</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={() => importMutation.mutate()}
          disabled={(!platformId && detectedParceiro.length <= 1) || parsedData.length === 0 || importMutation.isPending || parsing}
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
