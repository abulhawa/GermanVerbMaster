import { createContext, useContext, type ReactNode } from "react";

interface SidebarCollapsibleContextValue {
  collapsed: boolean;
}

const SidebarCollapsibleContext = createContext<SidebarCollapsibleContextValue | null>(null);

interface SidebarCollapsibleProviderProps extends SidebarCollapsibleContextValue {
  children: ReactNode;
}

export function SidebarCollapsibleProvider({
  collapsed,
  children,
}: SidebarCollapsibleProviderProps) {
  return (
    <SidebarCollapsibleContext.Provider value={{ collapsed }}>
      {children}
    </SidebarCollapsibleContext.Provider>
  );
}

export function useSidebarCollapsed(): SidebarCollapsibleContextValue {
  const context = useContext(SidebarCollapsibleContext);

  if (!context) {
    throw new Error("useSidebarCollapsed must be used within a SidebarCollapsibleProvider");
  }

  return context;
}
