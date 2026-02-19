import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  processado: { label: "Processado", variant: "secondary" },
  conciliado: { label: "Conciliado", variant: "default" },
  divergente: { label: "Divergente", variant: "destructive" },
};

export function ImportsList() {
  const { data: imports = [] } = useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statement_imports")
        .select("*, platforms(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const fmt = (v: number | null) => v != null ? `R$ ${Number(v).toFixed(2)}` : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" /> Extratos Importados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum extrato importado ainda.</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plataforma</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Taxas</TableHead>
                  <TableHead className="text-right">Descontos</TableHead>
                  <TableHead className="text-right">Repasse</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp: any) => {
                  const st = STATUS_MAP[imp.status] || STATUS_MAP.pendente;
                  return (
                    <TableRow key={imp.id}>
                      <TableCell className="font-medium">{imp.platforms?.name}</TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{imp.file_name}</TableCell>
                      <TableCell className="text-sm">
                        {imp.period_start && imp.period_end
                          ? `${imp.period_start} a ${imp.period_end}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">{fmt(imp.total_bruto)}</TableCell>
                      <TableCell className="text-right text-destructive">{fmt(imp.total_taxas)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(imp.total_descontos)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(imp.total_repasse)}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
