/**
 * useNavigation.tsx
 * Context simples para navegação programática entre abas
 * e passagem de filtros entre componentes.
 *
 * Uso:
 *   const { navigateTo } = useNavigation();
 *   navigateTo("divergencias", { marca: "Kitchin", data_inicio: "2026-02-02" });
 */

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface NavigationFilter {
  marca?: string;
  data_inicio?: string;
  data_fim?: string;
  tipo?: string;       // divergencia_tipo
  status?: string;     // tratativa_status
}

interface NavigationState {
  activeTab: string;
  filter: NavigationFilter;
}

interface NavigationContextValue {
  activeTab: string;
  filter: NavigationFilter;
  navigateTo: (tab: string, filter?: NavigationFilter) => void;
  clearFilter: () => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  activeTab: "conciliacao",
  filter: {},
  navigateTo: () => {},
  clearFilter: () => {},
});

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>({
    activeTab: "conciliacao",
    filter: {},
  });

  const navigateTo = useCallback((tab: string, filter: NavigationFilter = {}) => {
    setState({ activeTab: tab, filter });
  }, []);

  const clearFilter = useCallback(() => {
    setState((s) => ({ ...s, filter: {} }));
  }, []);

  return (
    <NavigationContext.Provider value={{ ...state, navigateTo, clearFilter }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
