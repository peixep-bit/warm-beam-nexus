import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingDown, ArrowRightLeft, FileText } from "lucide-react";

export function DashboardSummary() {
  const { data: imports = [] } = useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("statement_imports").select("*");
      if (error) throw error;
      return data;
    },
  });

  const totalBruto = imports.reduce((s, i) => s + (Number(i.total_bruto) || 0), 0);
  const totalTaxas = imports.reduce((s, i) => s + (Number(i.total_taxas) || 0), 0);
  const totalDescontos = imports.reduce((s, i) => s + (Number(i.total_descontos) || 0), 0);
  const totalRepasse = imports.reduce((s, i) => s + (Number(i.total_repasse) || 0), 0);

  const cards = [
    { title: "Total Bruto", value: totalBruto, icon: DollarSign, color: "text-foreground" },
    { title: "Total Taxas", value: totalTaxas, icon: TrendingDown, color: "text-destructive" },
    { title: "Total Descontos", value: totalDescontos, icon: TrendingDown, color: "text-muted-foreground" },
    { title: "Total Repasse", value: totalRepasse, icon: ArrowRightLeft, color: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${c.color}`}>
              R$ {c.value.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{imports.length} extrato(s)</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
