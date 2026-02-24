import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatementImport } from "@/components/StatementImport";
import { ImportsList } from "@/components/ImportsList";
import { PlatformManager } from "@/components/PlatformManager";
import { FeeRulesManager } from "@/components/FeeRulesManager";
import { ReconciliationDashboard } from "@/components/ReconciliationDashboard";
import { Utensils, LogOut } from "lucide-react";

export default function Index() {
  const { user, loading, signOut } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

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
            <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        <Tabs defaultValue="conciliacao" className="space-y-4">
          <TabsList className="h-9">
            <TabsTrigger value="conciliacao" className="text-xs">Conciliação</TabsTrigger>
            <TabsTrigger value="import" className="text-xs">Importar</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Histórico</TabsTrigger>
            <TabsTrigger value="platforms" className="text-xs">Plataformas</TabsTrigger>
            <TabsTrigger value="rules" className="text-xs">Taxas</TabsTrigger>
          </TabsList>

          <TabsContent value="conciliacao">
            <ReconciliationDashboard />
          </TabsContent>
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
