import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, isAfter, isBefore, startOfDay, addDays, endOfMonth, parseISO } from "date-fns";

export function FluxoCaixaDashboard() {
  const { user } = useAuth();
  const [marca, setMarca] = useState("__all__");
  const [periodo, setPeriodo] = useState("30d");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["fluxo-caixa-items", marca],
    queryFn: async () => {
      let query = supabase.from("statement_items")
        .select("data_prevista_repasse, valor_liquido_conciliado, valor_liquido, quantidade_pedidos, order_status, marca")
        .not("data_prevista_repasse", "is", null);

      if (marca !== "__all__") query = query.eq("marca", marca);
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const marcasDisponiveis = Array.from(new Set(items.map(i => i.marca).filter(Boolean))).sort();

  const today = startOfDay(new Date());
  
  let endDate = addDays(today, 30);
  if (periodo === "7d") endDate = addDays(today, 7);
  if (periodo === "mes") endDate = endOfMonth(today);

  const grupos = new Map<string, { date: string, total: number, orders: number }>();
  
  let totalAtrasado = 0;
  let totalPrevisto = 0;
  let totalPrevisto7d = 0;

  items.forEach(item => {
    if (item.order_status === "cancelado") return;

    const val = Number(item.valor_liquido_conciliado) || Number(item.valor_liquido) || 0;
    const dateStr = item.data_prevista_repasse;
    if (!dateStr) return;
    
    const date = parseISO(dateStr);
    
    if (isBefore(date, today)) {
      totalAtrasado += val;
    } else {
      totalPrevisto += val;
      if (isBefore(date, addDays(today, 7))) {
        totalPrevisto7d += val;
      }
    }

    if (isBefore(date, today) || isAfter(date, endDate)) return;

    if (!grupos.has(dateStr)) {
      grupos.set(dateStr, { date: dateStr, total: 0, orders: 0 });
    }
    const g = grupos.get(dateStr)!;
    g.total += val;
    g.orders += Number(item.quantidade_pedidos) || 1;
  });

  const chartData = Array.from(grupos.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(g => ({
      date: format(parseISO(g.date), "dd/MM"),
      total: g.total,
      rawDate: g.date,
      orders: g.orders
    }));

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Carregando fluxo de caixa...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto">
          <div className="w-full sm:w-48">
            <Select value={marca} onValueChange={setMarca}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas as marcas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as marcas</SelectItem>
                {marcasDisponiveis.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Próximos 7 dias</SelectItem>
                <SelectItem value="30d">Próximos 30 dias</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Previsto Geral</CardTitle>
            <CalendarIcon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{fmt(totalPrevisto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Próximos 7 dias</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{fmt(totalPrevisto7d)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atrasado (Passado)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{fmt(totalAtrasado)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Previsão por Data</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground border-t">
                Sem previsões para o período
              </div>
            ) : (
              <ChartContainer config={{ total: { color: "hsl(var(--primary))", label: "Previsto" } }} className="h-[300px] w-full">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis 
                    tickFormatter={(value) => `R$ ${value}`} 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Resumo Diário</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="max-h-[300px] overflow-y-auto px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.map(r => (
                    <TableRow key={r.rawDate}>
                      <TableCell className="font-medium text-xs">{format(parseISO(r.rawDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right text-xs text-primary">{fmt(r.total)}</TableCell>
                    </TableRow>
                  ))}
                  {chartData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground text-xs h-24">Nenhuma data prevista</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}