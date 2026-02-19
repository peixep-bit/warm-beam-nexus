import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSummary } from "@/components/DashboardSummary";
import { StatementImport } from "@/components/StatementImport";
import { ImportsList } from "@/components/ImportsList";
import { PlatformManager } from "@/components/PlatformManager";
import { FeeRulesManager } from "@/components/FeeRulesManager";
import { Utensils, LogOut } from "lucide-react";

export default function Index() {
  const { user, loading, signOut } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Utensils className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Concilia Delivery</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <DashboardSummary />

        <Tabs defaultValue="import" className="space-y-4">
          <TabsList>
            <TabsTrigger value="import">Importar</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="platforms">Plataformas</TabsTrigger>
            <TabsTrigger value="rules">Regras de Taxas</TabsTrigger>
          </TabsList>

          <TabsContent value="import">
            <StatementImport />
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
