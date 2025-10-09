import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";
import { SidebarCollapsibleProvider } from "./sidebar-collapsible-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserMenuControl } from "@/components/auth/user-menu-control";

interface AppShellProps extends DebuggableComponentProps {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  mobileNav?: ReactNode;
}

export function AppShell({
  sidebar,
  children,
  className,
  debugId,
  mobileNav,
}: AppShellProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "layout-app-shell";
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const handleSidebarEnter = () => {
    setIsSidebarExpanded(true);
  };

  const handleSidebarLeave = () => {
    setIsSidebarExpanded(false);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        {...getDevAttributes("layout-app-shell-root", resolvedDebugId)}
        className="min-h-screen bg-background text-muted-foreground"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 gap-6 px-4 pb-28 pt-6 lg:grid-cols-[auto_1fr] lg:pb-6">
          <SidebarCollapsibleProvider collapsed={!isSidebarExpanded}>
            <aside
              data-collapsed={!isSidebarExpanded}
              onMouseEnter={handleSidebarEnter}
              onMouseLeave={handleSidebarLeave}
            className={cn(
              "group/sidebar order-last hidden h-full rounded-app border border-border/60 bg-card/90 p-4 shadow-soft backdrop-blur transition-[width] duration-200 ease-out lg:order-first lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)]",
              "w-full",
              isSidebarExpanded ? "lg:w-[280px]" : "lg:w-[88px]",
            )}
          >
            {sidebar}
          </aside>
        </SidebarCollapsibleProvider>
          <div
            className={cn(
              "flex min-h-screen flex-col gap-4 pb-20 lg:pb-6",
              mobileNav ? "pb-16" : "",
            )}
          >
            <main
              className={cn(
                "flex-1 rounded-app bg-card/60 px-4 pb-16 pt-4 ring-1 ring-inset ring-border/40 sm:px-6 lg:px-8 xl:px-10",
                className,
              )}
            >
              <UserMenuControl className="mb-2" />
              {children}
            </main>
          </div>
        </div>
        {mobileNav ? (
          <div className="fixed inset-x-0 bottom-0 z-overlay border-t border-border/40 bg-card/95 px-2 pb-1 pt-1 shadow-soft backdrop-blur lg:hidden">
            {mobileNav}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
