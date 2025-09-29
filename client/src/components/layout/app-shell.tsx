import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ sidebar, topBar, children, className }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 text-muted-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="order-last h-full rounded-3xl border border-border/60 bg-card/90 p-6 shadow-xl shadow-primary/5 backdrop-blur lg:order-first lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          {sidebar}
        </aside>
        <div className="flex min-h-screen flex-col gap-6 pb-10 lg:pb-6">
          <header className="sticky top-0 z-30 rounded-3xl border border-border/60 bg-card/80 p-4 shadow-lg shadow-primary/5 backdrop-blur-lg">
            {topBar}
          </header>
          <main
            className={cn(
              "flex-1 px-4 pb-16 pt-2 sm:px-6 lg:px-8 xl:px-10",
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
