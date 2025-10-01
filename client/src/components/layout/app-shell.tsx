import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";

interface AppShellProps extends DebuggableComponentProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({
  sidebar,
  topBar,
  children,
  className,
  debugId,
}: AppShellProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "layout-app-shell";

  return (
    <div
      {...getDevAttributes("layout-app-shell-root", resolvedDebugId)}
      className="min-h-screen bg-background text-muted-foreground"
    >
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="order-last h-full rounded-app border border-border/60 bg-card/90 p-6 shadow-soft backdrop-blur lg:order-first lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          {sidebar}
        </aside>
        <div className="flex min-h-screen flex-col gap-6 pb-10 lg:pb-6">
          <header className="relative sticky top-0 z-30 rounded-app border border-border bg-card/85 p-4 pr-16 shadow-soft backdrop-blur">
            <ThemeToggle className="absolute right-4 top-4" debugId={`${resolvedDebugId}-theme-toggle`} />
            {topBar}
          </header>
          <main
            className={cn(
              "flex-1 rounded-app bg-card/60 px-4 pb-16 pt-2 ring-1 ring-inset ring-border/50 sm:px-6 lg:px-8 xl:px-10",
              className,
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
