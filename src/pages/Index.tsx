import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatementImport } from "@/components/StatementImport";
import { ImportsList } from "@/components/ImportsList";
import { PlatformManager } from "@/components/PlatformManager";
import { FeeRulesManager } from "@/components/FeeRulesManager";
import { ReconciliationDashboard } from "@/components/ReconciliationDashboard";
import { DivergenciasDashboard } from "@/components/DivergenciasDashboard";
import { FluxoCaixaDashboard } from "@/components/FluxoCaixaDashboard";
import { IFoodImport } from "@/components/IFoodImport";
import { IFoodFechamento } from "@/components/IFoodFechamento";
import { Utensils, LogOut } from "lucide-react";
import { useState } from "react";

export default function Index() {
  const { user, loading, signOut } = useAuth();
  const [fechamentoPeriodo] = useState({
    start: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground shadow-sm">
          Carregando dados...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Utensils className="h-4 w-4" />
            </div>
            <h1 className="text-base font-bold tracking-tight">Concilia Delivery</h1>
          </div>
          <div className="flex items-center gap-2">
            {user && <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        <Tabs defaultValue="conciliacao" className="space-y-4">
          <TabsList className="h-9 flex-wrap">
            <TabsTrigger value="conciliacao"  className="text-xs">Conciliação</TabsTrigger>
            <TabsTrigger value="divergencias" className="text-xs">Divergências</TabsTrigger>
            <TabsTrigger value="fluxo_caixa" className="text-xs">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="import"       className="text-xs">Importar</TabsTrigger>
            <TabsTrigger value="fechamento"   className="text-xs">Fechamento</TabsTrigger>
            <TabsTrigger value="history"      className="text-xs">Histórico</TabsTrigger>
            <TabsTrigger value="platforms"    className="text-xs">Plataformas</TabsTrigger>
            <TabsTrigger value="rules"        className="text-xs">Taxas</TabsTrigger>
          </TabsList>

          <TabsContent value="conciliacao">
            <ReconciliationDashboard />
          </TabsContent>
          <TabsContent value="divergencias">
            <DivergenciasDashboard />
          </TabsContent>
          <TabsContent value="fluxo_caixa">
            <FluxoCaixaDashboard />
          </TabsContent>

          {/* Importar — iFood no topo, importação genérica abaixo */}
          <TabsContent value="import">
            <Tabs defaultValue="ifood" className="space-y-3">
              <TabsList className="h-8">
                <TabsTrigger value="ifood"   className="text-xs">📦 iFood / 99Food</TabsTrigger>
                <TabsTrigger value="outros"  className="text-xs">📄 Outros extratos</TabsTrigger>
              </TabsList>
              <TabsContent value="ifood">
                <IFoodImport />
              </TabsContent>
              <TabsContent value="outros">
                <StatementImport />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Fechamento de período */}
          <TabsContent value="fechamento">
            <IFoodFechamento
              periodoStart={fechamentoPeriodo.start}
              periodoEnd={fechamentoPeriodo.end}
            />
          </TabsContent>

          <TabsContent value="history">
            <ImportsList />
          </TabsContent>
          <TabsContent value="platforms">
            <PlatformManager />
          </TabsContent>
          <TabsContent value="rules">
            <FeeRulesManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
