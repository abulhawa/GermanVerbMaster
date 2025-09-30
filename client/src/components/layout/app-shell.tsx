import { ReactNode } from "react";
import { Page } from "@/components/primitives/page";
import { cn } from "@/lib/cn";

interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ sidebar, topBar, children, className }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--bg))] via-[hsl(var(--bg))] to-[hsl(var(--muted))] text-muted">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="order-last h-full rounded-2xl border border-border/60 bg-card/90 p-6 shadow-xl shadow-primary/5 backdrop-blur lg:order-first lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          {sidebar}
        </aside>
        <div className="flex min-h-screen flex-col gap-6 pb-10 lg:pb-6">
          <header className="sticky top-0 z-overlay rounded-2xl border border-border/60 bg-card/80 p-4 shadow-lg shadow-primary/5 backdrop-blur-lg">
            {topBar}
          </header>
          <main className="flex-1">
            <Page className={cn("flex flex-col gap-8 pb-16", className)}>{children}</Page>
          </main>
        </div>
      </div>
    </div>
  );
}
